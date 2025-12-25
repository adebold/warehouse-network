/**
 * Form Scanner
 * Scans and validates forms against database schema
 */

import {
  DatabaseSchema,
  FormValidationResult,
  FormValidationConfig,
  IntegrityResult,
  IntegrityError,
  ValidationResult,
  FormField,
  FormSuggestion
} from '../types';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import path from 'path';
import winston from 'winston';
import { memoryBank } from '../memory-bank/memory-bank';
import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db';

export class FormScanner {
  private schema: DatabaseSchema;
  private config: FormValidationConfig;
  private logger: winston.Logger;

  constructor(schema: DatabaseSchema, config: FormValidationConfig) {
    this.schema = schema;
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async scan(): Promise<IntegrityResult<FormValidationResult[]>> {
    const correlationId = memoryBank.setCorrelationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Scanning forms');
      
      await memoryBank.log({
        category: IntegrityLogCategory.FORM_VALIDATION,
        level: IntegrityLogLevel.INFO,
        operation: 'scan',
        component: 'FormScanner',
        message: 'Starting form validation scan',
        metadata: { 
          scanDirs: this.config.scanDirs,
          frameworks: this.config.frameworks
        },
        success: true,
        correlationId
      });
      
      const forms = await this.findForms();
      const results: FormValidationResult[] = [];

      for (const form of forms) {
        const result = await this.validateForm(form);
        results.push(result);
      }

      const invalidForms = results.filter(r => !r.validation.valid);
      
      this.logger.info(`Scanned ${results.length} forms, ${invalidForms.length} have issues`);
      
      // Log scan results
      await memoryBank.log({
        category: IntegrityLogCategory.FORM_VALIDATION,
        level: invalidForms.length > 0 ? IntegrityLogLevel.WARNING : IntegrityLogLevel.INFO,
        operation: 'scan',
        component: 'FormScanner',
        message: `Scanned ${results.length} forms, ${invalidForms.length} have validation issues`,
        details: {
          totalForms: results.length,
          invalidForms: invalidForms.length,
          validForms: results.length - invalidForms.length,
          formsByFramework: results.reduce((acc, r) => {
            acc[r.framework] = (acc[r.framework] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        duration: Date.now() - startTime,
        success: true,
        correlationId
      });
      
      // Log individual form issues
      for (const invalidForm of invalidForms) {
        await memoryBank.log({
          category: IntegrityLogCategory.FORM_VALIDATION,
          level: IntegrityLogLevel.WARNING,
          operation: 'validateForm',
          component: 'FormScanner',
          message: `Form validation failed: ${invalidForm.formPath}`,
          details: {
            formName: invalidForm.formName,
            framework: invalidForm.framework,
            errors: invalidForm.validation.errors,
            warnings: invalidForm.validation.warnings
          },
          success: false,
          correlationId
        });
      }
      
      return {
        success: true,
        data: results,
        warnings: invalidForms.length > 0 
          ? [`${invalidForms.length} forms have validation issues`]
          : undefined
      };
    } catch (error) {
      this.logger.error('Failed to scan forms', error);
      
      await memoryBank.log({
        category: IntegrityLogCategory.FORM_VALIDATION,
        level: IntegrityLogLevel.ERROR,
        operation: 'scan',
        component: 'FormScanner',
        message: 'Failed to scan forms',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId
      });
      
      return {
        success: false,
        error: {
          code: 'FORM_SCAN_FAILED',
          message: 'Failed to scan forms',
          details: error
        }
      };
    }
  }

  private async findForms(): Promise<FormInfo[]> {
    const forms: FormInfo[] = [];
    
    for (const dir of this.config.scanDirs) {
      for (const pattern of this.config.filePatterns) {
        const files = await glob(path.join(dir, pattern));
        
        for (const file of files) {
          const content = readFileSync(file, 'utf8');
          const framework = this.detectFramework(content, file);
          
          if (framework && this.config.frameworks.includes(framework)) {
            forms.push({
              path: file,
              content,
              framework
            });
          }
        }
      }
    }
    
    return forms;
  }

  private detectFramework(content: string, filePath: string): string | null {
    // Next.js/React
    if (content.includes('import React') || 
        content.includes('from "react"') ||
        content.includes('from \'react\'') ||
        filePath.includes('.tsx') ||
        filePath.includes('.jsx')) {
      
      if (content.includes('use client') || 
          content.includes('use server') ||
          content.includes('getServerSideProps') ||
          content.includes('getStaticProps')) {
        return 'nextjs';
      }
      
      return 'react';
    }
    
    // Vue
    if (content.includes('<template>') && content.includes('<script>')) {
      return 'vue';
    }
    
    // Angular
    if (content.includes('@Component') || content.includes('@angular')) {
      return 'angular';
    }
    
    return null;
  }

  private async validateForm(form: FormInfo): Promise<FormValidationResult> {
    const formName = path.basename(form.path, path.extname(form.path));
    const fields = this.extractFormFields(form.content, form.framework);
    const validation = this.validateFields(fields, form);
    const suggestions = this.generateSuggestions(fields, validation);

    return {
      formPath: form.path,
      formName,
      framework: form.framework,
      fields,
      validation,
      suggestions
    };
  }

  private extractFormFields(content: string, framework: string): FormField[] {
    const fields: FormField[] = [];
    
    switch (framework) {
      case 'react':
      case 'nextjs':
        fields.push(...this.extractReactFormFields(content));
        break;
      case 'vue':
        fields.push(...this.extractVueFormFields(content));
        break;
      case 'angular':
        fields.push(...this.extractAngularFormFields(content));
        break;
    }
    
    return fields;
  }

  private extractReactFormFields(content: string): FormField[] {
    const fields: FormField[] = [];
    const fieldMap = new Map<string, FormField>();
    
    // React Hook Form
    const hookFormPatterns = [
      /register\(['"](\w+)['"]/g,
      /{\.\.\.register\(['"](\w+)['"]/g
    ];
    
    for (const pattern of hookFormPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!fieldMap.has(name)) {
          fieldMap.set(name, {
            name,
            type: 'text',
            required: false
          });
        }
      }
    }
    
    // Standard form inputs
    const inputPatterns = [
      /<input[^>]+name=['"](\w+)['"]/g,
      /<select[^>]+name=['"](\w+)['"]/g,
      /<textarea[^>]+name=['"](\w+)['"]/g,
      /<Input[^>]+name=['"](\w+)['"]/g,
      /<Select[^>]+name=['"](\w+)['"]/g,
      /<Textarea[^>]+name=['"](\w+)['"]/g
    ];
    
    for (const pattern of inputPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!fieldMap.has(name)) {
          fieldMap.set(name, {
            name,
            type: this.extractInputType(content, name),
            required: this.extractRequired(content, name)
          });
        }
      }
    }
    
    // Validation rules
    const validationPattern = /rules:\s*{[^}]*required:\s*true[^}]*}/g;
    let match;
    while ((match = validationPattern.exec(content)) !== null) {
      // Extract field name associated with this rule
      const beforeMatch = content.substring(Math.max(0, match.index - 100), match.index);
      const nameMatch = beforeMatch.match(/name=['"](\w+)['"]/);
      if (nameMatch) {
        const field = fieldMap.get(nameMatch[1]);
        if (field) {
          field.required = true;
        }
      }
    }
    
    return Array.from(fieldMap.values());
  }

  private extractVueFormFields(content: string): FormField[] {
    const fields: FormField[] = [];
    
    // Vue v-model
    const vModelPattern = /v-model=['"]?(\w+)['"]?/g;
    let match;
    
    while ((match = vModelPattern.exec(content)) !== null) {
      fields.push({
        name: match[1],
        type: 'text',
        required: false
      });
    }
    
    return fields;
  }

  private extractAngularFormFields(content: string): FormField[] {
    const fields: FormField[] = [];
    
    // Angular ngModel and formControlName
    const patterns = [
      /\[(ngModel)\]=['"](\w+)['"]/g,
      /formControlName=['"](\w+)['"]/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = pattern === patterns[0] ? match[2] : match[1];
        fields.push({
          name,
          type: 'text',
          required: false
        });
      }
    }
    
    return fields;
  }

  private extractInputType(content: string, fieldName: string): string {
    // Look for type attribute near the field name
    const fieldRegex = new RegExp(`name=['"]${fieldName}['"][^>]*type=['"](\w+)['"]`, 'i');
    const match = content.match(fieldRegex);
    
    if (match) {
      return match[1];
    }
    
    // Check for specific component types
    if (content.includes(`<Select[^>]*name=['"]${fieldName}['"]`)) {
      return 'select';
    }
    if (content.includes(`<Textarea[^>]*name=['"]${fieldName}['"]`)) {
      return 'textarea';
    }
    
    return 'text';
  }

  private extractRequired(content: string, fieldName: string): boolean {
    // Check for required attribute
    const requiredPatterns = [
      new RegExp(`name=['"]${fieldName}['"][^>]*required`, 'i'),
      new RegExp(`name=['"]${fieldName}['"][^>]*rules={{[^}]*required:\\s*true`, 'i')
    ];
    
    return requiredPatterns.some(pattern => pattern.test(content));
  }

  private validateFields(fields: FormField[], form: FormInfo): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];
    
    // Extract table context from form
    const tableContext = this.extractTableContext(form.content);
    
    if (tableContext) {
      const table = this.schema.tables.find(t => t.name === tableContext);
      
      if (!table) {
        errors.push({
          type: 'invalid_table',
          table: tableContext,
          message: `Referenced table '${tableContext}' not found in schema`,
          severity: 'error'
        });
      } else {
        // Check fields against table columns
        for (const field of fields) {
          const column = table.columns.find(c => c.name === field.name);
          
          if (!column) {
            warnings.push({
              type: 'unknown_field',
              field: field.name,
              message: `Field '${field.name}' not found in table '${table.name}'`,
              suggestion: this.findSimilarColumn(field.name, table.columns)
            });
          } else {
            // Validate field properties
            if (this.config.validateRequired) {
              if (!column.nullable && !field.required && !column.default) {
                errors.push({
                  type: 'missing_required',
                  field: field.name,
                  message: `Field '${field.name}' is required in database but not marked as required in form`,
                  severity: 'error'
                });
              }
            }
            
            if (this.config.validateTypes) {
              const expectedType = this.mapColumnTypeToFormType(column.type);
              if (expectedType !== field.type && expectedType !== 'text') {
                warnings.push({
                  type: 'type_mismatch',
                  field: field.name,
                  message: `Field '${field.name}' type mismatch: expected '${expectedType}', got '${field.type}'`
                });
              }
            }
          }
        }
        
        // Check for missing required fields
        if (this.config.validateRequired) {
          const requiredColumns = table.columns.filter(c => !c.nullable && !c.default && !c.autoIncrement);
          for (const column of requiredColumns) {
            if (!fields.find(f => f.name === column.name)) {
              errors.push({
                type: 'missing_field',
                field: column.name,
                message: `Required field '${column.name}' is missing from form`,
                severity: 'error'
              });
            }
          }
        }
      }
    } else {
      warnings.push({
        type: 'no_context',
        message: 'Could not determine which database table this form is for'
      });
    }
    
    // Apply custom validators
    if (this.config.customValidators) {
      for (const validator of this.config.customValidators) {
        if (validator.framework === form.framework) {
          for (const field of fields) {
            const result = validator.validate(field, this.schema);
            errors.push(...result.errors);
            warnings.push(...result.warnings);
            suggestions.push(...result.suggestions);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  private extractTableContext(content: string): string | null {
    // Try to determine which table this form is for
    const patterns = [
      /prisma\.(\w+)\.(create|update|upsert)/,
      /model:\s*['"](\w+)['"]/,
      /table:\s*['"](\w+)['"]/,
      /\/api\/(\w+)/,
      /(\w+)Form/,
      /(\w+)Modal/
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const tableName = match[1].toLowerCase();
        // Check if this table exists
        if (this.schema.tables.find(t => t.name === tableName)) {
          return tableName;
        }
      }
    }
    
    return null;
  }

  private findSimilarColumn(fieldName: string, columns: any[]): string {
    // Simple similarity check
    const similar = columns.find(c => 
      c.name.toLowerCase().includes(fieldName.toLowerCase()) ||
      fieldName.toLowerCase().includes(c.name.toLowerCase())
    );
    
    if (similar) {
      return `Did you mean '${similar.name}'?`;
    }
    
    return 'Check field name spelling';
  }

  private mapColumnTypeToFormType(columnType: string): string {
    const typeMap: Record<string, string> = {
      'text': 'text',
      'varchar': 'text',
      'char': 'text',
      'integer': 'number',
      'int': 'number',
      'bigint': 'number',
      'decimal': 'number',
      'numeric': 'number',
      'float': 'number',
      'double': 'number',
      'boolean': 'checkbox',
      'bool': 'checkbox',
      'date': 'date',
      'timestamp': 'datetime-local',
      'time': 'time',
      'json': 'textarea',
      'jsonb': 'textarea'
    };
    
    const type = columnType.toLowerCase().split('(')[0];
    return typeMap[type] || 'text';
  }

  private generateSuggestions(fields: FormField[], validation: ValidationResult): FormSuggestion[] {
    const suggestions: FormSuggestion[] = [];
    
    // Add suggestions based on validation results
    for (const error of validation.errors) {
      if (error.type === 'missing_field') {
        suggestions.push({
          field: error.field,
          type: 'missing',
          message: `Add field '${error.field}' to the form`,
          recommendation: `This field is required in the database`,
          code: `<input name="${error.field}" type="text" required />`
        });
      }
    }
    
    for (const warning of validation.warnings) {
      if (warning.type === 'type_mismatch') {
        suggestions.push({
          field: warning.field,
          type: 'mismatch',
          message: warning.message,
          recommendation: `Change input type to match database column type`,
          code: warning.suggestion
        });
      }
    }
    
    return suggestions;
  }
}

interface FormInfo {
  path: string;
  content: string;
  framework: string;
}