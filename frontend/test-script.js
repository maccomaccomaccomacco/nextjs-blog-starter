require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAIApi = require('openai');

const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to recursively read files in a directory and categorize them
function readFilesRecursively(dir) {
  let results = { components: [], pages: [] };
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      // Recursively read subdirectories
      const subdirResults = readFilesRecursively(filePath);
      results.components = results.components.concat(subdirResults.components);
      results.pages = results.pages.concat(subdirResults.pages);
    } else {
      // Check file extension before adding
      if (
        filePath.endsWith('.js') ||
        filePath.endsWith('.jsx') ||
        filePath.endsWith('.ts') ||
        filePath.endsWith('.tsx')
      ) {
        if (dir.includes('_components')) {
          results.components.push(filePath);
        } else {
          results.pages.push(filePath);
        }
      }
    }
  });
  return results;
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeStrapiFiles(type, name, config, basePath) {
  // Determine the base path for the type
  const typeBasePath =
    type === 'components'
      ? path.join(basePath, 'components', name)
      : path.join(basePath, 'api', name);

  // Ensure the base directory exists
  ensureDirSync(typeBasePath);

  // Determine the correct directory for schema files based on type
  const schemaPath =
    type === 'components'
      ? path.join(typeBasePath, `${name}.json`)
      : path.join(typeBasePath, 'content-types', name, 'schema.json');
  ensureDirSync(path.dirname(schemaPath)); // Ensure the directory for the schema file exists

  // Write the schema configuration file
  fs.writeFileSync(schemaPath, JSON.stringify(config, null, 2));

  if (type !== 'components') {
    // Create directories for controllers, services, and routes
    const dirs = ['controllers', 'services', 'routes'];
    dirs.forEach((dir) => {
      const dirPath = path.join(typeBasePath, dir);
      ensureDirSync(dirPath);
      const filePath = path.join(dirPath, `${name}.js`);
      const baseFileContent = `'use strict';
module.exports = {
  // Custom ${dir.slice(0, -1)} logic for ${name}
};`;
      fs.writeFileSync(filePath, baseFileContent);
    });
  }
}

async function analyzeCodebase(files, role) {
  console.log(`Analyzing ${role}...`);
  const combinedCode = files
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that generates Strapi ${role} configurations from given JavaScript or TypeScript code. Ensure to include details such as 'kind', 'collectionName', 'info', 'singularName', 'pluralName', 'displayName', 'options', 'pluginOptions', and detailed attributes including types, defaults, and relationships following Strapi's version 4 format.`,
      },
      {
        role: 'user',
        content: `Here is the combined code for ${role}:\n\n${combinedCode}\n\nGenerate the corresponding Strapi ${role} configurations in JSON format, adhering to the official Strapi content-type structure and specifications. Please focus on completeness and accuracy of the schema. Do not include any comments or code blocks.`,
      },
    ],
    max_tokens: 1200,
  });

  if (
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content
  ) {
    let outputText = response.choices[0].message.content;

    // Attempt to remove non-JSON text which may precede or follow valid JSON
    const potentialJson = outputText.substring(
      outputText.indexOf('{'),
      outputText.lastIndexOf('}') + 1
    );

    try {
      console.log('Attempting to parse cleaned output:', potentialJson);
      return JSON.parse(potentialJson);
    } catch (error) {
      console.error(
        'Failed to parse JSON:',
        error,
        'From text:',
        potentialJson
      );
      throw new Error('Received invalid JSON from AI');
    }
  } else {
    throw new Error('No valid response or missing content from AI');
  }
}

async function main() {
  const outputPath = './strapi-project'; // Base path to your Strapi project
  const nextjsAppFolder = path.resolve(__dirname, './src/app');
  const { components, pages } = readFilesRecursively(nextjsAppFolder);

  console.log('Starting analysis of content types...');
  // Handle content types first
  for (const page of pages) {
    try {
      const config = await analyzeCodebase([page], 'content types');
      writeStrapiFiles(
        'content types',
        path.basename(page, path.extname(page)),
        config,
        outputPath
      );
      console.log(
        `Content type configuration generated for ${path.basename(
          page,
          path.extname(page)
        )}`
      );
    } catch (error) {
      console.error(`Failed to process content type: ${page}`, error);
    }
  }

  console.log('Starting analysis of components...');
  // Then handle components
  for (const component of components) {
    try {
      const config = await analyzeCodebase([component], 'components');
      writeStrapiFiles(
        'components',
        path.basename(component, path.extname(component)),
        config,
        outputPath
      );
      console.log(
        `Component configuration generated for ${path.basename(
          component,
          path.extname(component)
        )}`
      );
    } catch (error) {
      console.error(`Failed to process component: ${component}`, error);
    }
  }

  console.log(
    'Strapi configurations generated. Check the output folder for results.'
  );
}

main().catch((error) => console.error('Error in main function:', error));
