/**
 * Warehouse Form Validator
 * Validates forms against warehouse-network Prisma models
 */

import {
  DatabaseSchema,
  IntegrityResult,
  PaymentFormValidation,
  OperationFormValidation,
  FieldMismatch,
  PrismaModel
} from '../types';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import path from 'path';
import winston from 'winston';

export class WarehouseFormValidator {
  private schema: DatabaseSchema;
  private logger: winston.Logger;
  private paymentModels = ['Customer', 'Deposit', 'Quote', 'Payout'];
  private operationModels = ['Skid', 'ReceivingOrder', 'ReleaseRequest', 'Warehouse'];

  constructor(schema: DatabaseSchema) {
    this.schema = schema;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async validatePaymentForms(): Promise<IntegrityResult<PaymentFormValidation[]>> {
    try {
      this.logger.info('Validating payment forms');
      
      const validations: PaymentFormValidation[] = [];
      const formFiles = await this.findFormFiles(['**/payment/**/*.tsx', '**/billing/**/*.tsx', '**/stripe/**/*.tsx']);

      for (const file of formFiles) {
        const content = readFileSync(file, 'utf8');
        const formName = path.basename(file, '.tsx');
        
        // Detect which model this form is for
        const model = this.detectPaymentModel(content, formName);
        if (!model) continue;

        const validation = this.validateFormAgainstModel(
          formName,
          content,
          model as 'Customer' | 'Deposit' | 'Quote'
        );
        
        validations.push(validation);
      }

      this.logger.info(`Validated ${validations.length} payment forms`);
      return { success: true, data: validations };
    } catch (error) {
      this.logger.error('Failed to validate payment forms', error);
      return {
        success: false,
        error: {
          code: 'PAYMENT_FORM_VALIDATION_FAILED',
          message: 'Failed to validate payment forms',
          details: error
        }
      };
    }
  }

  async validateOperationForms(): Promise<IntegrityResult<OperationFormValidation[]>> {
    try {
      this.logger.info('Validating operation forms');
      
      const validations: OperationFormValidation[] = [];
      const formFiles = await this.findFormFiles([
        '**/warehouse/**/*.tsx',
        '**/operations/**/*.tsx',
        '**/inventory/**/*.tsx',
        '**/receiving/**/*.tsx'
      ]);

      for (const file of formFiles) {
        const content = readFileSync(file, 'utf8');
        const formName = path.basename(file, '.tsx');
        
        // Detect which model this form is for
        const model = this.detectOperationModel(content, formName);
        if (!model) continue;

        const validation = this.validateOperationFormAgainstModel(
          formName,
          content,
          model as 'Skid' | 'ReceivingOrder' | 'ReleaseRequest' | 'Warehouse'
        );
        
        validations.push(validation);
      }

      this.logger.info(`Validated ${validations.length} operation forms`);
      return { success: true, data: validations };
    } catch (error) {
      this.logger.error('Failed to validate operation forms', error);
      return {
        success: false,
        error: {
          code: 'OPERATION_FORM_VALIDATION_FAILED',
          message: 'Failed to validate operation forms',
          details: error
        }
      };
    }
  }

  private async findFormFiles(patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    
    for (const pattern of patterns) {
      const matches = await glob(path.join(process.cwd(), 'apps/web', pattern));
      files.push(...matches);
    }
    
    return files;
  }

  private detectPaymentModel(content: string, formName: string): string | null {
    // Check for model references in the form
    if (content.includes('Customer') || formName.toLowerCase().includes('customer')) {
      return 'Customer';
    }
    if (content.includes('Deposit') || formName.toLowerCase().includes('deposit')) {
      return 'Deposit';
    }
    if (content.includes('Quote') || formName.toLowerCase().includes('quote')) {
      return 'Quote';
    }
    if (content.includes('Payout') || formName.toLowerCase().includes('payout')) {
      return 'Payout';
    }
    
    return null;
  }

  private detectOperationModel(content: string, formName: string): string | null {
    // Check for model references in the form
    if (content.includes('Skid') || formName.toLowerCase().includes('skid')) {
      return 'Skid';
    }
    if (content.includes('ReceivingOrder') || formName.toLowerCase().includes('receiving')) {
      return 'ReceivingOrder';
    }
    if (content.includes('ReleaseRequest') || formName.toLowerCase().includes('release')) {
      return 'ReleaseRequest';
    }
    if (content.includes('Warehouse') || formName.toLowerCase().includes('warehouse')) {
      return 'Warehouse';
    }
    
    return null;
  }

  private validateFormAgainstModel(
    formName: string,
    content: string,
    modelName: 'Customer' | 'Deposit' | 'Quote'
  ): PaymentFormValidation {
    const model = this.schema.prismaModels?.find(m => m.name === modelName);
    if (!model) {
      return {
        formName,
        model: modelName,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        valid: false
      };
    }

    const formFields = this.extractFormFields(content);
    const modelFields = model.fields.map(f => f.name);
    
    // Find missing required fields
    const requiredFields = model.fields
      .filter(f => f.isRequired && !f.hasDefaultValue && !f.isReadOnly)
      .map(f => f.name);
    const missingFields = requiredFields.filter(f => !formFields.includes(f));
    
    // Find extra fields not in model
    const extraFields = formFields.filter(f => !modelFields.includes(f));
    
    // Check type mismatches
    const typeMismatches = this.checkTypeMismatches(content, model);

    return {
      formName,
      model: modelName,
      missingFields,
      extraFields,
      typeMismatches,
      valid: missingFields.length === 0 && typeMismatches.filter(t => t.severity === 'error').length === 0
    };
  }

  private validateOperationFormAgainstModel(
    formName: string,
    content: string,
    modelName: 'Skid' | 'ReceivingOrder' | 'ReleaseRequest' | 'Warehouse'
  ): OperationFormValidation {
    const model = this.schema.prismaModels?.find(m => m.name === modelName);
    if (!model) {
      return {
        formName,
        model: modelName,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        valid: false
      };
    }

    const formFields = this.extractFormFields(content);
    const modelFields = model.fields.map(f => f.name);
    
    // Find missing required fields
    const requiredFields = model.fields
      .filter(f => f.isRequired && !f.hasDefaultValue && !f.isReadOnly)
      .map(f => f.name);
    const missingFields = requiredFields.filter(f => !formFields.includes(f));
    
    // Find extra fields not in model
    const extraFields = formFields.filter(f => !modelFields.includes(f));
    
    // Check type mismatches
    const typeMismatches = this.checkTypeMismatches(content, model);

    return {
      formName,
      model: modelName,
      missingFields,
      extraFields,
      typeMismatches,
      valid: missingFields.length === 0 && typeMismatches.filter(t => t.severity === 'error').length === 0
    };
  }

  private extractFormFields(content: string): string[] {
    const fields: string[] = [];
    
    // Extract fields from various patterns
    const patterns = [
      /name=['"](\w+)['"]/g,
      /register\(['"](\w+)['"]/g,
      /getValues\(['"](\w+)['"]/g,
      /watch\(['"](\w+)['"]/g,
      /errors\.(\w+)/g,
      /field\.name === ['"](\w+)['"]/g,
      /<Input[^>]*name=['"](\w+)['"]/g,
      /<Select[^>]*name=['"](\w+)['"]/g,
      /<Textarea[^>]*name=['"](\w+)['"]/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (!fields.includes(match[1])) {
          fields.push(match[1]);
        }
      }
    }

    return fields;
  }

  private checkTypeMismatches(content: string, model: PrismaModel): FieldMismatch[] {
    const mismatches: FieldMismatch[] = [];
    
    for (const field of model.fields) {
      // Check if field type in form matches model type
      const fieldPattern = new RegExp(`${field.name}.*type=['"]([^'"]+)['"]`);
      const match = content.match(fieldPattern);
      
      if (match) {
        const formType = match[1];
        const expectedType = this.mapPrismaTypeToFormType(field.type);
        
        if (formType !== expectedType) {
          mismatches.push({
            field: field.name,
            expectedType,
            actualType: formType,
            severity: this.getTypeMismatchSeverity(expectedType, formType)
          });
        }
      }

      // Check validation rules
      if (field.isRequired && !content.includes(`${field.name}.*required`)) {
        mismatches.push({
          field: field.name,
          expectedType: 'required',
          actualType: 'optional',
          severity: 'warning'
        });
      }
    }

    return mismatches;
  }

  private mapPrismaTypeToFormType(prismaType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'text',
      'Int': 'number',
      'Float': 'number',
      'Boolean': 'checkbox',
      'DateTime': 'date',
      'Json': 'textarea',
      'Decimal': 'number'
    };
    
    return typeMap[prismaType] || 'text';
  }

  private getTypeMismatchSeverity(expected: string, actual: string): 'error' | 'warning' {
    // Some mismatches are more severe than others
    if (expected === 'number' && actual === 'text') {
      return 'error';
    }
    if (expected === 'checkbox' && actual !== 'checkbox') {
      return 'error';
    }
    
    return 'warning';
  }
}