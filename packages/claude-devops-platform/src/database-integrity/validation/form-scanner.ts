/**
 * Form Scanner
 * Scans frontend forms and validates against database schema
 */

import {
  FormSchema,
  FormField,
  FormFieldType,
  DatabaseSchema,
  Table,
  Column,
  IntegrityResult,
  IntegrityError,
  ValidationConfig,
  FieldValidation,
  DriftType
} from '../types';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import glob from 'globby';
import { parse as parseAST } from '@babel/parser';
import traverse from '@babel/traverse';
import { parse as parseVue } from '@vue/compiler-sfc';
import { z } from 'zod';

export interface FormValidationResult {
  form: FormSchema;
  table?: Table;
  missingColumns: string[];
  typeMismatches: Array<{
    field: string;
    formType: string;
    columnType: string;
  }>;
  extraFields: string[];
  validationMismatches: Array<{
    field: string;
    issue: string;
  }>;
}

export class FormScanner extends EventEmitter {
  private schema: DatabaseSchema;
  private config: ValidationConfig['forms'];
  private forms: Map<string, FormSchema> = new Map();

  constructor(schema: DatabaseSchema, config: ValidationConfig['forms']) {
    super();
    this.schema = schema;
    this.config = config;
  }

  /**
   * Scan and validate all forms
   */
  async scan(): Promise<IntegrityResult<FormValidationResult[]>> {
    try {
      if (!this.config.enabled) {
        return { 
          success: true, 
          data: [], 
          metadata: { message: 'Form validation disabled' } 
        };
      }

      // Scan for form files
      const formFiles = await this.scanFormFiles();

      // Extract forms from files
      for (const file of formFiles) {
        const forms = await this.extractFormsFromFile(file);
        for (const form of forms) {
          this.forms.set(form.name, form);
        }
      }

      // Validate forms against schema
      const validationResults: FormValidationResult[] = [];
      
      if (this.config.validateAgainstSchema) {
        for (const form of this.forms.values()) {
          const result = await this.validateFormAgainstSchema(form);
          validationResults.push(result);
        }
      }

      // Generate warnings
      const warnings = this.generateWarnings(validationResults);

      this.emit('validation_complete', {
        total: validationResults.length,
        valid: validationResults.filter(r => this.isValidResult(r)).length,
        warnings: warnings.length
      });

      return {
        success: true,
        data: validationResults,
        warnings
      };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'FORM_SCAN_FAILED',
        message: 'Failed to scan forms',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Scan for form files
   */
  private async scanFormFiles(): Promise<string[]> {
    const patterns = this.config.patterns.length > 0 
      ? this.config.patterns 
      : [
          '**/components/**/*.{jsx,tsx}',
          '**/forms/**/*.{jsx,tsx}',
          '**/views/**/*.{jsx,tsx}',
          '**/pages/**/*.{jsx,tsx}',
          '**/*.vue'
        ];

    const files = await glob(patterns, {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**']
    });

    // Add custom directories
    for (const dir of this.config.directories) {
      const dirFiles = await glob(path.join(dir, '**/*.{jsx,tsx,vue}'), {
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      files.push(...dirFiles);
    }

    return [...new Set(files)];
  }

  /**
   * Extract forms from a file
   */
  private async extractFormsFromFile(filepath: string): Promise<FormSchema[]> {
    const content = await fs.readFile(filepath, 'utf-8');
    const forms: FormSchema[] = [];
    const ext = path.extname(filepath).toLowerCase();

    try {
      if (ext === '.vue') {
        forms.push(...await this.extractVueForms(content, filepath));
      } else {
        forms.push(...await this.extractReactForms(content, filepath));
      }
    } catch (error) {
      this.emit('warning', `Failed to parse form file: ${filepath}`);
    }

    return forms;
  }

  /**
   * Extract forms from React/JSX/TSX files
   */
  private async extractReactForms(content: string, filepath: string): Promise<FormSchema[]> {
    const forms: FormSchema[] = [];
    
    const ast = parseAST(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });

    traverse(ast, {
      JSXElement(nodePath) {
        const node = nodePath.node;
        const opening = node.openingElement;
        
        // Check if this is a form element
        if (opening.name.type === 'JSXIdentifier' && 
            (opening.name.name === 'form' || opening.name.name.toLowerCase().includes('form'))) {
          
          const form = extractReactForm(node, filepath);
          if (form) forms.push(form);
        }
      },

      // Also check for form components
      CallExpression(nodePath) {
        const node = nodePath.node;
        
        // Check for useForm hook (React Hook Form)
        if (node.callee.type === 'Identifier' && node.callee.name === 'useForm') {
          const form = extractHookForm(nodePath, filepath);
          if (form) forms.push(form);
        }
        
        // Check for Formik forms
        if (node.callee.type === 'Identifier' && node.callee.name === 'Formik') {
          const form = extractFormikForm(node, filepath);
          if (form) forms.push(form);
        }
      }
    });

    return forms;

    // Helper to extract standard React form
    function extractReactForm(node: any, filepath: string): FormSchema | null {
      const fields: FormField[] = [];
      let submitAction = '';
      let formName = path.basename(filepath, path.extname(filepath));

      // Extract form attributes
      for (const attr of node.openingElement.attributes || []) {
        if (attr.type === 'JSXAttribute' && attr.name.name === 'onSubmit') {
          if (attr.value && attr.value.expression) {
            submitAction = 'handleSubmit';
          }
        }
        if (attr.type === 'JSXAttribute' && attr.name.name === 'id') {
          if (attr.value && attr.value.type === 'StringLiteral') {
            formName = attr.value.value;
          }
        }
      }

      // Traverse form children to find inputs
      function traverseElement(element: any) {
        if (!element) return;

        if (element.type === 'JSXElement') {
          const tagName = element.openingElement.name.name;
          
          // Check if this is an input element
          if (['input', 'textarea', 'select'].includes(tagName)) {
            const field = extractFieldFromElement(element);
            if (field) fields.push(field);
          }

          // Traverse children
          if (element.children) {
            for (const child of element.children) {
              traverseElement(child);
            }
          }
        }
      }

      traverseElement(node);

      return {
        name: formName,
        path: filepath,
        fields,
        submitAction
      };
    }

    // Helper to extract form field from JSX element
    function extractFieldFromElement(element: any): FormField | null {
      const field: FormField = {
        name: '',
        type: FormFieldType.TEXT,
        required: false
      };

      const tagName = element.openingElement.name.name;

      // Extract attributes
      for (const attr of element.openingElement.attributes || []) {
        if (attr.type === 'JSXAttribute') {
          const attrName = attr.name.name;
          
          switch (attrName) {
            case 'name':
              if (attr.value && attr.value.type === 'StringLiteral') {
                field.name = attr.value.value;
              }
              break;
              
            case 'type':
              if (attr.value && attr.value.type === 'StringLiteral') {
                field.type = mapHtmlTypeToFormFieldType(attr.value.value);
              }
              break;
              
            case 'required':
              field.required = true;
              break;
              
            case 'placeholder':
              if (attr.value && attr.value.type === 'StringLiteral') {
                field.placeholder = attr.value.value;
              }
              break;
              
            case 'min':
            case 'max':
            case 'minLength':
            case 'maxLength':
            case 'pattern':
              if (!field.validation) field.validation = {};
              if (attr.value) {
                const key = attrName as keyof FieldValidation;
                field.validation[key] = attr.value.type === 'StringLiteral' 
                  ? attr.value.value 
                  : attr.value.expression?.value;
              }
              break;
          }
        }
      }

      // Set type based on tag name
      if (tagName === 'textarea') {
        field.type = FormFieldType.TEXTAREA;
      } else if (tagName === 'select') {
        field.type = FormFieldType.SELECT;
      }

      return field.name ? field : null;
    }

    // Helper to extract React Hook Form
    function extractHookForm(nodePath: any, filepath: string): FormSchema | null {
      const fields: FormField[] = [];
      const formName = path.basename(filepath, path.extname(filepath));

      // Look for register calls
      nodePath.traverse({
        CallExpression(callPath: any) {
          const node = callPath.node;
          
          if (node.callee.type === 'Identifier' && node.callee.name === 'register') {
            if (node.arguments.length > 0 && node.arguments[0].type === 'StringLiteral') {
              const fieldName = node.arguments[0].value;
              const options = node.arguments[1];
              
              const field: FormField = {
                name: fieldName,
                type: FormFieldType.TEXT,
                required: false
              };

              // Extract validation rules from options
              if (options && options.type === 'ObjectExpression') {
                for (const prop of options.properties) {
                  if (prop.type === 'ObjectProperty' && prop.key.name === 'required') {
                    field.required = true;
                  }
                  // Extract other validation rules
                  if (prop.type === 'ObjectProperty' && 
                      ['min', 'max', 'minLength', 'maxLength', 'pattern'].includes(prop.key.name)) {
                    if (!field.validation) field.validation = {};
                    field.validation[prop.key.name as keyof FieldValidation] = prop.value.value;
                  }
                }
              }

              fields.push(field);
            }
          }
        }
      });

      return {
        name: formName,
        path: filepath,
        fields,
        submitAction: 'handleSubmit'
      };
    }

    // Helper to extract Formik form
    function extractFormikForm(node: any, filepath: string): FormSchema | null {
      const fields: FormField[] = [];
      const formName = path.basename(filepath, path.extname(filepath));

      // Look for initialValues prop
      const initialValuesProps = node.arguments[0]?.properties?.find(
        (p: any) => p.key.name === 'initialValues'
      );

      if (initialValuesProps && initialValuesProps.value.type === 'ObjectExpression') {
        for (const prop of initialValuesProps.value.properties) {
          if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
            fields.push({
              name: prop.key.name,
              type: FormFieldType.TEXT,
              required: false,
              defaultValue: prop.value.value
            });
          }
        }
      }

      // Look for validation schema
      const validationSchemaProps = node.arguments[0]?.properties?.find(
        (p: any) => p.key.name === 'validationSchema'
      );

      // TODO: Extract validation rules from Yup schema

      return {
        name: formName,
        path: filepath,
        fields,
        submitAction: 'onSubmit'
      };
    }

    // Helper to map HTML input types to FormFieldType
    function mapHtmlTypeToFormFieldType(htmlType: string): FormFieldType {
      const typeMap: Record<string, FormFieldType> = {
        'text': FormFieldType.TEXT,
        'email': FormFieldType.EMAIL,
        'password': FormFieldType.PASSWORD,
        'number': FormFieldType.NUMBER,
        'date': FormFieldType.DATE,
        'datetime': FormFieldType.DATETIME,
        'datetime-local': FormFieldType.DATETIME,
        'time': FormFieldType.TIME,
        'checkbox': FormFieldType.CHECKBOX,
        'radio': FormFieldType.RADIO,
        'file': FormFieldType.FILE,
        'hidden': FormFieldType.HIDDEN
      };

      return typeMap[htmlType] || FormFieldType.TEXT;
    }
  }

  /**
   * Extract forms from Vue files
   */
  private async extractVueForms(content: string, filepath: string): Promise<FormSchema[]> {
    const forms: FormSchema[] = [];
    const { descriptor } = parseVue(content);

    if (!descriptor.template) {
      return forms;
    }

    // Parse template to find forms
    const templateAst = parseAST(`<>${descriptor.template.content}</>`, {
      sourceType: 'module',
      plugins: ['jsx']
    });

    // Extract forms similar to React approach
    traverse(templateAst, {
      JSXElement(nodePath) {
        const node = nodePath.node;
        const opening = node.openingElement;
        
        if (opening.name.type === 'JSXIdentifier' && 
            (opening.name.name === 'form' || opening.name.name === 'el-form')) {
          
          const form = extractVueForm(node, filepath);
          if (form) forms.push(form);
        }
      }
    });

    return forms;

    // Helper to extract Vue form
    function extractVueForm(node: any, filepath: string): FormSchema | null {
      const fields: FormField[] = [];
      const formName = path.basename(filepath, path.extname(filepath));

      // Traverse form children to find inputs
      function traverseElement(element: any) {
        if (!element) return;

        if (element.type === 'JSXElement') {
          const tagName = element.openingElement.name.name;
          
          // Check for form fields
          if (['input', 'textarea', 'select', 'el-input', 'el-select', 'el-date-picker'].includes(tagName)) {
            const field = extractVueField(element);
            if (field) fields.push(field);
          }

          // Traverse children
          if (element.children) {
            for (const child of element.children) {
              traverseElement(child);
            }
          }
        }
      }

      traverseElement(node);

      return {
        name: formName,
        path: filepath,
        fields,
        submitAction: 'handleSubmit'
      };
    }

    // Helper to extract Vue form field
    function extractVueField(element: any): FormField | null {
      const field: FormField = {
        name: '',
        type: FormFieldType.TEXT,
        required: false
      };

      for (const attr of element.openingElement.attributes || []) {
        if (attr.type === 'JSXAttribute') {
          const attrName = attr.name.name;
          
          switch (attrName) {
            case 'v-model':
            case ':v-model':
              if (attr.value && attr.value.expression) {
                field.name = attr.value.expression.property?.name || attr.value.expression.name;
              }
              break;
              
            case 'type':
              if (attr.value && attr.value.type === 'StringLiteral') {
                field.type = mapVueTypeToFormFieldType(attr.value.value);
              }
              break;
              
            case 'required':
            case ':required':
              field.required = true;
              break;
          }
        }
      }

      return field.name ? field : null;
    }

    // Helper to map Vue types
    function mapVueTypeToFormFieldType(vueType: string): FormFieldType {
      const typeMap: Record<string, FormFieldType> = {
        'text': FormFieldType.TEXT,
        'email': FormFieldType.EMAIL,
        'password': FormFieldType.PASSWORD,
        'number': FormFieldType.NUMBER,
        'date': FormFieldType.DATE,
        'datetime': FormFieldType.DATETIME,
        'select': FormFieldType.SELECT,
        'textarea': FormFieldType.TEXTAREA
      };

      return typeMap[vueType] || FormFieldType.TEXT;
    }
  }

  /**
   * Validate form against database schema
   */
  private async validateFormAgainstSchema(form: FormSchema): Promise<FormValidationResult> {
    const result: FormValidationResult = {
      form,
      missingColumns: [],
      typeMismatches: [],
      extraFields: [],
      validationMismatches: []
    };

    // Try to find matching table
    const table = this.findMatchingTable(form);
    if (!table) {
      return result;
    }

    result.table = table;

    // Create column map
    const columnMap = new Map(table.columns.map(c => [c.name, c]));

    // Check each form field
    for (const field of form.fields) {
      const column = columnMap.get(field.name);

      if (!column) {
        // Field doesn't exist in database
        result.extraFields.push(field.name);
      } else {
        // Check type compatibility
        const expectedType = this.mapColumnTypeToFormFieldType(column);
        if (expectedType !== field.type && !this.areTypesCompatible(field.type, expectedType)) {
          result.typeMismatches.push({
            field: field.name,
            formType: field.type,
            columnType: column.type
          });
        }

        // Check validation rules
        const validationIssues = this.validateFieldRules(field, column);
        if (validationIssues.length > 0) {
          for (const issue of validationIssues) {
            result.validationMismatches.push({
              field: field.name,
              issue
            });
          }
        }
      }
    }

    // Check for missing required columns
    for (const column of table.columns) {
      if (!column.nullable && !column.autoIncrement && !column.defaultValue) {
        const field = form.fields.find(f => f.name === column.name);
        if (!field) {
          result.missingColumns.push(column.name);
        }
      }
    }

    return result;
  }

  /**
   * Find matching table for form
   */
  private findMatchingTable(form: FormSchema): Table | undefined {
    const formName = form.name.toLowerCase();

    // Try exact match
    let table = this.schema.tables.find(t => t.name.toLowerCase() === formName);
    
    // Try singular form
    if (!table) {
      const singular = this.singularize(formName);
      table = this.schema.tables.find(t => t.name.toLowerCase() === singular);
    }

    // Try plural form
    if (!table) {
      const plural = this.pluralize(formName);
      table = this.schema.tables.find(t => t.name.toLowerCase() === plural);
    }

    // Try removing common prefixes/suffixes
    if (!table) {
      const cleaned = formName
        .replace(/^(create|edit|update|new|add)/, '')
        .replace(/(form|page|view|component)$/, '');
      table = this.schema.tables.find(t => t.name.toLowerCase() === cleaned);
    }

    return table;
  }

  /**
   * Map column type to form field type
   */
  private mapColumnTypeToFormFieldType(column: Column): FormFieldType {
    const type = column.type.toLowerCase();

    if (type.includes('bool')) return FormFieldType.CHECKBOX;
    if (type.includes('text') || type.includes('clob')) return FormFieldType.TEXTAREA;
    if (type.includes('date') && type.includes('time')) return FormFieldType.DATETIME;
    if (type.includes('date')) return FormFieldType.DATE;
    if (type.includes('time')) return FormFieldType.TIME;
    if (type.includes('int') || type.includes('numeric') || 
        type.includes('decimal') || type.includes('float')) return FormFieldType.NUMBER;
    
    // Check column name for hints
    if (column.name.includes('email')) return FormFieldType.EMAIL;
    if (column.name.includes('password')) return FormFieldType.PASSWORD;
    if (column.name.includes('url') || column.name.includes('link')) return FormFieldType.TEXT;

    return FormFieldType.TEXT;
  }

  /**
   * Check if form field type and column type are compatible
   */
  private areTypesCompatible(formType: FormFieldType, expectedType: FormFieldType): boolean {
    // Some types are interchangeable
    const compatibleTypes: Record<FormFieldType, FormFieldType[]> = {
      [FormFieldType.TEXT]: [FormFieldType.EMAIL, FormFieldType.PASSWORD, FormFieldType.NUMBER],
      [FormFieldType.EMAIL]: [FormFieldType.TEXT],
      [FormFieldType.PASSWORD]: [FormFieldType.TEXT],
      [FormFieldType.NUMBER]: [FormFieldType.TEXT],
      [FormFieldType.SELECT]: [FormFieldType.RADIO],
      [FormFieldType.RADIO]: [FormFieldType.SELECT],
      [FormFieldType.DATE]: [FormFieldType.DATETIME],
      [FormFieldType.DATETIME]: [FormFieldType.DATE]
    };

    const compatible = compatibleTypes[formType] || [];
    return compatible.includes(expectedType);
  }

  /**
   * Validate field rules against column constraints
   */
  private validateFieldRules(field: FormField, column: Column): string[] {
    const issues: string[] = [];

    // Check required mismatch
    if (field.required !== !column.nullable) {
      if (field.required && column.nullable) {
        issues.push('Field is required but column allows NULL');
      } else if (!field.required && !column.nullable && !column.defaultValue) {
        issues.push('Field is optional but column requires a value');
      }
    }

    // Check length constraints
    if (field.validation) {
      if (column.type.includes('varchar')) {
        const maxLengthMatch = column.type.match(/\((\d+)\)/);
        if (maxLengthMatch) {
          const dbMaxLength = parseInt(maxLengthMatch[1]);
          
          if (field.validation.maxLength && field.validation.maxLength > dbMaxLength) {
            issues.push(`Field max length (${field.validation.maxLength}) exceeds database limit (${dbMaxLength})`);
          }
        }
      }

      // Check numeric constraints
      if (column.type.includes('int') || column.type.includes('numeric')) {
        // TODO: Extract numeric constraints from column definition
      }
    }

    return issues;
  }

  /**
   * Generate warnings from validation results
   */
  private generateWarnings(results: FormValidationResult[]): string[] {
    const warnings: string[] = [];

    for (const result of results) {
      const formName = result.form.name;

      // Warnings for missing columns
      for (const column of result.missingColumns) {
        warnings.push(`Form '${formName}' missing required field '${column}'`);
      }

      // Warnings for type mismatches
      for (const mismatch of result.typeMismatches) {
        warnings.push(
          `Form '${formName}' field '${mismatch.field}' has type '${mismatch.formType}' ` +
          `but database expects '${mismatch.columnType}'`
        );
      }

      // Warnings for extra fields
      for (const field of result.extraFields) {
        warnings.push(`Form '${formName}' has field '${field}' not found in database`);
      }

      // Warnings for validation mismatches
      for (const mismatch of result.validationMismatches) {
        warnings.push(`Form '${formName}' field '${mismatch.field}': ${mismatch.issue}`);
      }
    }

    return warnings;
  }

  /**
   * Check if validation result is valid
   */
  private isValidResult(result: FormValidationResult): boolean {
    return result.missingColumns.length === 0 &&
           result.typeMismatches.length === 0 &&
           result.validationMismatches.length === 0;
  }

  /**
   * Generate migration suggestions for form changes
   */
  async generateMigrationSuggestions(results: FormValidationResult[]): Promise<string[]> {
    const suggestions: string[] = [];

    for (const result of results) {
      if (!result.table) continue;

      // Suggest adding missing columns
      for (const field of result.form.fields) {
        if (result.extraFields.includes(field.name)) {
          const columnType = this.suggestColumnType(field);
          const nullable = !field.required ? 'NULL' : 'NOT NULL';
          
          suggestions.push(
            `ALTER TABLE "${result.table.name}" ADD COLUMN "${field.name}" ${columnType} ${nullable};`
          );
        }
      }

      // Suggest modifying type mismatches
      for (const mismatch of result.typeMismatches) {
        const field = result.form.fields.find(f => f.name === mismatch.field);
        if (field) {
          const newType = this.suggestColumnType(field);
          suggestions.push(
            `ALTER TABLE "${result.table.name}" ALTER COLUMN "${mismatch.field}" TYPE ${newType};`
          );
        }
      }
    }

    return suggestions;
  }

  /**
   * Suggest column type based on form field
   */
  private suggestColumnType(field: FormField): string {
    switch (field.type) {
      case FormFieldType.TEXT:
        return field.validation?.maxLength 
          ? `VARCHAR(${field.validation.maxLength})`
          : 'TEXT';
      case FormFieldType.EMAIL:
        return 'VARCHAR(255)';
      case FormFieldType.PASSWORD:
        return 'VARCHAR(255)';
      case FormFieldType.NUMBER:
        return field.validation?.max && field.validation.max < 32767 
          ? 'SMALLINT'
          : 'INTEGER';
      case FormFieldType.DATE:
        return 'DATE';
      case FormFieldType.DATETIME:
        return 'TIMESTAMP';
      case FormFieldType.TIME:
        return 'TIME';
      case FormFieldType.CHECKBOX:
        return 'BOOLEAN';
      case FormFieldType.TEXTAREA:
        return 'TEXT';
      case FormFieldType.FILE:
        return 'VARCHAR(500)';
      default:
        return 'VARCHAR(255)';
    }
  }

  /**
   * Singularize a word
   */
  private singularize(word: string): string {
    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('es')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s')) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Pluralize a word
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s') || word.endsWith('x') || 
        word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }
    return word + 's';
  }
}