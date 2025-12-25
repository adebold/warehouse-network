const fs = require('fs-extra');
const path = require('path');

const detectors = {
  node: async (projectPath) => {
    return await fs.exists(path.join(projectPath, 'package.json'));
  },
  
  python: async (projectPath) => {
    const files = ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'];
    for (const file of files) {
      if (await fs.exists(path.join(projectPath, file))) {
        return true;
      }
    }
    return false;
  },
  
  go: async (projectPath) => {
    return await fs.exists(path.join(projectPath, 'go.mod'));
  },
  
  java: async (projectPath) => {
    const files = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
    for (const file of files) {
      if (await fs.exists(path.join(projectPath, file))) {
        return true;
      }
    }
    return false;
  },
  
  ruby: async (projectPath) => {
    return await fs.exists(path.join(projectPath, 'Gemfile'));
  },
  
  php: async (projectPath) => {
    return await fs.exists(path.join(projectPath, 'composer.json'));
  },
  
  rust: async (projectPath) => {
    return await fs.exists(path.join(projectPath, 'Cargo.toml'));
  },
  
  dotnet: async (projectPath) => {
    const files = await fs.readdir(projectPath);
    return files.some(file => file.endsWith('.csproj') || file.endsWith('.sln'));
  }
};

async function detect(projectPath) {
  for (const [type, detector] of Object.entries(detectors)) {
    if (await detector(projectPath)) {
      return type;
    }
  }
  
  return 'unknown';
}

async function getProjectInfo(projectPath) {
  const type = await detect(projectPath);
  const info = {
    type,
    path: projectPath,
    name: path.basename(projectPath)
  };
  
  // Get additional info based on type
  switch (type) {
    case 'node':
      const packageJson = await fs.readJSON(path.join(projectPath, 'package.json'));
      info.name = packageJson.name || info.name;
      info.version = packageJson.version;
      info.dependencies = Object.keys(packageJson.dependencies || {});
      info.devDependencies = Object.keys(packageJson.devDependencies || {});
      break;
      
    case 'python':
      if (await fs.exists(path.join(projectPath, 'setup.py'))) {
        // Could parse setup.py for more info
      }
      break;
      
    case 'go':
      const goMod = await fs.readFile(path.join(projectPath, 'go.mod'), 'utf-8');
      const moduleMatch = goMod.match(/module\s+(.+)/);
      if (moduleMatch) {
        info.module = moduleMatch[1];
      }
      break;
  }
  
  return info;
}

module.exports = {
  detect,
  getProjectInfo
};