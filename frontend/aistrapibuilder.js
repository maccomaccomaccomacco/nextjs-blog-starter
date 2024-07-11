require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAIApi = require('openai');

// Initialize OpenAI API client using environment variable for API key
const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to recursively read files in a directory and categorize them
const readFilesRecursively = (dir) => {
  let results = { components: [], pages: [] };
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      const subdirResults = readFilesRecursively(filePath);
      results.components = results.components.concat(subdirResults.components);
      results.pages = results.pages.concat(subdirResults.pages);
    } else if (dir.includes('_components')) {
      results.components.push(filePath);
    } else {
      results.pages.push(filePath);
    }
  });
  return results;
};

// Function to clean and prepare the output folder
const prepareOutputFolder = (outputPath) => {
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  } else {
    const files = fs.readdirSync(outputPath);
    files.forEach((file) => fs.unlinkSync(path.join(outputPath, file)));
  }
};

// Function to analyze codebase using OpenAI API
const analyzeCodebase = async (files, role) => {
  console.log(`Analyzing ${role}...`);
  try {
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
      max_tokens: 800,
    });

    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content
    ) {
      let outputText = response.choices[0].message.content;

      // Remove any unwanted markdown formatting or additional annotations
      outputText = outputText.replace(/```json|```/g, '').trim(); // Remove markdown code blocks
      return outputText;
    } else {
      throw new Error('No valid response or missing content from API');
    }
  } catch (error) {
    console.error(`Error analyzing ${role}:`, error);
    console.error('Faulty JSON:', error.message);
    throw error;
  }
};

// Main function to run the analysis
const main = async () => {
  const outputPath = './output';
  prepareOutputFolder(outputPath);

  const nextjsAppFolder = path.resolve(__dirname, './src/app');
  const { components, pages } = readFilesRecursively(nextjsAppFolder);

  const componentConfigurations = await analyzeCodebase(
    components,
    'components'
  );
  fs.writeFileSync(
    `${outputPath}/strapi_components.json`,
    componentConfigurations
  );
  console.log('Components configuration generated.');

  const contentTypeConfigurations = await analyzeCodebase(
    pages,
    'content types'
  );
  fs.writeFileSync(
    `${outputPath}/strapi_content_types.json`,
    contentTypeConfigurations
  );
  console.log('Content types configuration generated.');

  console.log('Analysis complete. Check the output folder for results.');
};

main().catch((error) => {
  console.error('Error in main function:', error);
});
