/**
 * File Type Detector
 * 
 * Detects programming language from file extension
 */

export class FileTypeDetector {
  private static extensionMap: Map<string, string> = new Map([
    // JavaScript/TypeScript
    ['.js', 'javascript'],
    ['.jsx', 'javascript'],
    ['.mjs', 'javascript'],
    ['.cjs', 'javascript'],
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.d.ts', 'typescript'],
    
    // Python
    ['.py', 'python'],
    ['.pyw', 'python'],
    ['.pyx', 'python'],
    
    // Java
    ['.java', 'java'],
    
    // Go
    ['.go', 'go'],
    
    // Rust
    ['.rs', 'rust'],
    
    // C#
    ['.cs', 'csharp'],
    
    // C/C++
    ['.c', 'c'],
    ['.h', 'c'],
    ['.cpp', 'cpp'],
    ['.cc', 'cpp'],
    ['.cxx', 'cpp'],
    ['.hpp', 'cpp'],
    ['.hh', 'cpp'],
    ['.hxx', 'cpp'],
    
    // PHP
    ['.php', 'php'],
    ['.phtml', 'php'],
    
    // Ruby
    ['.rb', 'ruby'],
    ['.rake', 'ruby'],
    
    // Swift
    ['.swift', 'swift'],
    
    // Kotlin
    ['.kt', 'kotlin'],
    ['.kts', 'kotlin'],
    
    // Scala
    ['.scala', 'scala'],
    ['.sc', 'scala'],
    
    // Shell
    ['.sh', 'shell'],
    ['.bash', 'shell'],
    ['.zsh', 'shell'],
    
    // Other
    ['.lua', 'lua'],
    ['.r', 'r'],
    ['.R', 'r'],
    ['.pl', 'perl'],
    ['.pm', 'perl'],
    ['.dart', 'dart'],
    ['.elm', 'elm'],
    ['.ex', 'elixir'],
    ['.exs', 'elixir'],
    ['.erl', 'erlang'],
    ['.hrl', 'erlang'],
    ['.fs', 'fsharp'],
    ['.fsx', 'fsharp'],
    ['.fsi', 'fsharp'],
    ['.ml', 'ocaml'],
    ['.mli', 'ocaml'],
    ['.pas', 'pascal'],
    ['.pp', 'pascal'],
    ['.hs', 'haskell'],
    ['.lhs', 'haskell'],
    ['.jl', 'julia'],
    ['.nim', 'nim'],
    ['.nims', 'nim'],
    ['.cr', 'crystal'],
    ['.d', 'd'],
    ['.zig', 'zig'],
    ['.v', 'vlang'],
    ['.sv', 'systemverilog'],
    ['.svh', 'systemverilog'],
    ['.vhd', 'vhdl'],
    ['.vhdl', 'vhdl']
  ]);

  /**
   * Detect language from file path
   */
  static detectLanguage(filePath: string): string | null {
    // Extract extension
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) {
      return this.detectFromShebang(filePath);
    }

    const extension = filePath.substring(lastDot).toLowerCase();
    
    // Check if it's a TypeScript declaration file
    if (filePath.endsWith('.d.ts')) {
      return 'typescript';
    }

    return this.extensionMap.get(extension) || null;
  }

  /**
   * Check if file is a supported language
   */
  static isSupported(filePath: string): boolean {
    return this.detectLanguage(filePath) !== null;
  }

  /**
   * Get all supported extensions
   */
  static getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Get all supported languages
   */
  static getSupportedLanguages(): string[] {
    return Array.from(new Set(this.extensionMap.values()));
  }

  /**
   * Detect language from shebang (for extensionless files)
   */
  private static detectFromShebang(filePath: string): string | null {
    // Common shebang patterns
    const shebangPatterns = [
      { pattern: /python|python[23]/, language: 'python' },
      { pattern: /node|nodejs/, language: 'javascript' },
      { pattern: /ruby/, language: 'ruby' },
      { pattern: /perl/, language: 'perl' },
      { pattern: /php/, language: 'php' },
      { pattern: /bash|sh|zsh/, language: 'shell' }
    ];

    // This would need actual file reading in practice
    // For now, return null for extensionless files
    return null;
  }

  /**
   * Get language display name
   */
  static getLanguageDisplayName(language: string): string {
    const displayNames: Record<string, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      java: 'Java',
      go: 'Go',
      rust: 'Rust',
      csharp: 'C#',
      cpp: 'C++',
      c: 'C',
      php: 'PHP',
      ruby: 'Ruby',
      swift: 'Swift',
      kotlin: 'Kotlin',
      scala: 'Scala',
      shell: 'Shell',
      lua: 'Lua',
      r: 'R',
      perl: 'Perl',
      dart: 'Dart',
      elm: 'Elm',
      elixir: 'Elixir',
      erlang: 'Erlang',
      fsharp: 'F#',
      ocaml: 'OCaml',
      pascal: 'Pascal',
      haskell: 'Haskell',
      julia: 'Julia',
      nim: 'Nim',
      crystal: 'Crystal',
      d: 'D',
      zig: 'Zig',
      vlang: 'V',
      systemverilog: 'SystemVerilog',
      vhdl: 'VHDL'
    };

    return displayNames[language] || language;
  }

  /**
   * Check if language supports specific features
   */
  static getLanguageFeatures(language: string): string[] {
    const features: Record<string, string[]> = {
      javascript: ['dynamic-typing', 'interpreted', 'prototype-based', 'async-await', 'modules'],
      typescript: ['static-typing', 'compiled', 'class-based', 'async-await', 'modules', 'generics', 'decorators'],
      python: ['dynamic-typing', 'interpreted', 'class-based', 'async-await', 'modules', 'decorators'],
      java: ['static-typing', 'compiled', 'class-based', 'threads', 'generics', 'annotations'],
      go: ['static-typing', 'compiled', 'goroutines', 'interfaces', 'modules'],
      rust: ['static-typing', 'compiled', 'memory-safe', 'async-await', 'traits', 'macros'],
      csharp: ['static-typing', 'compiled', 'class-based', 'async-await', 'generics', 'attributes'],
      cpp: ['static-typing', 'compiled', 'class-based', 'templates', 'macros'],
      php: ['dynamic-typing', 'interpreted', 'class-based', 'traits'],
      ruby: ['dynamic-typing', 'interpreted', 'class-based', 'blocks', 'modules'],
      swift: ['static-typing', 'compiled', 'class-based', 'protocols', 'generics'],
      kotlin: ['static-typing', 'compiled', 'class-based', 'coroutines', 'extensions']
    };

    return features[language] || [];
  }
}