require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAIApi = require('openai');

// Initialize OpenAI API client using environment variable for API key
const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY
});

// Function to recursively read files in a directory
const readFilesRecursively = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(readFilesRecursively(filePath));
    } else {
      results.push(filePath);
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
const analyzeCodebase = async (codebase) => {
  console.log('Analyzing the entire codebase...');
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that generates Strapi content type configurations from given JavaScript or TypeScript code. Follow the official Strapi content-type format closely.',
        },
        {
          role: 'user',
          content: `Here is the combined code from the project:\n\n${codebase}\n\nGenerate the corresponding Strapi content type and component configurations in JSON format. Focus on the structure and required fields for typical Strapi configurations. Please provide the raw JSON only, without any additional formatting or annotations like markdown or comments.`,
        },
      ],
      max_tokens: 800,
    });

    // Check if response has choices and text within the message
    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content
    ) {
      const outputText = response.choices[0].message.content;
      // Remove any unwanted markdown formatting if still present
      const cleanOutput = outputText.replace(/```json|```/g, '').trim();
      return cleanOutput;
    } else {
      throw new Error('No valid response or missing content from API');
    }
  } catch (error) {
    console.error(`Error analyzing codebase:`, error);
    throw error;
  }
};

// Main function to run the analysis
const main = async () => {
  const outputPath = './output';
  prepareOutputFolder(outputPath);

  const nextjsAppFolder = path.resolve(__dirname, './src/app');
  const files = readFilesRecursively(nextjsAppFolder);

  let combinedCode = '';
  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    combinedCode += `\n\n// File: ${file}\n\n${content}`;
  });

  try {
    const analysisResult = await analyzeCodebase(combinedCode);
    fs.writeFileSync(`${outputPath}/strapi_configurations.json`, analysisResult);
    console.log('Output generated: strapi_configurations.json');
  } catch (error) {
    console.error('Failed to generate output:', error);
  }

  console.log('Analysis complete. Check the output folder for results.');
};

main().catch((error) => {
  console.error('Error in main function:', error);
});
