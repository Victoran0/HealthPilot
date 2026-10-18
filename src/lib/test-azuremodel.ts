// import { AzureChatOpenAI } from "@langchain/openai"

// const llm = new AzureChatOpenAI({
//     model: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
//     temperature: 0,
//     maxTokens: undefined,
//     maxRetries: 2,
//     azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY, // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
//     azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_INSTANCE_NAME
//     azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
//     azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION, // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
// })

// const aiMsg = await llm.invoke([
//     [
//         "system",
//         "You are a helpful assistant that translates English to French. Translate the user sentence.",
//     ],
//     ["human", "I love programming."],
// ])


// console.log(aiMsg)

import { AzureOpenAIEmbeddings } from "@langchain/openai";
// Create a vector store with a sample text
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY, // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_INSTANCE_NAME
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION, // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
    maxRetries: 1,
});


const text = "LangChain is the framework for building context-aware reasoning applications";

const vectorstore = await MemoryVectorStore.fromDocuments(
    [{ pageContent: text, metadata: {} }],
    embeddings,
);

// Use the vector store as a retriever that returns a single document
const retriever = vectorstore.asRetriever(1);

// Retrieve the most similar text
const retrievedDocuments = await retriever.invoke("What is LangChain?")

console.log("The retrieved document is:", retrievedDocuments[0]?.pageContent);