declare module 'validate-npm-package-name' {
  interface ValidationResult {
    validForNewPackages: boolean;
    validForOldPackages: boolean;
    valid: boolean;
    warnings?: string[];
    errors?: string[];
  }

  function validate(name: string): ValidationResult;
  
  export = validate;
}