import validateNpmPackageName from 'validate-npm-package-name';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProjectName(name: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!name || name.trim() === '') {
    result.valid = false;
    result.errors.push('Project name cannot be empty');
    return result;
  }

  // Check npm package name validity
  const npmValidation = validateNpmPackageName(name);
  if (!npmValidation.validForNewPackages) {
    result.valid = false;
    if (npmValidation.errors) {
      result.errors.push(...npmValidation.errors);
    }
    if (npmValidation.warnings) {
      result.warnings.push(...npmValidation.warnings);
    }
  }

  // Additional checks
  if (name.length > 214) {
    result.valid = false;
    result.errors.push('Project name must be less than 214 characters');
  }

  if (!/^[a-z0-9-_]+$/.test(name)) {
    result.valid = false;
    result.errors.push('Project name can only contain lowercase letters, numbers, hyphens, and underscores');
  }

  if (name.startsWith('-') || name.endsWith('-')) {
    result.valid = false;
    result.errors.push('Project name cannot start or end with a hyphen');
  }

  return result;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateSemver(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}