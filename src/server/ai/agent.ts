// import { MemorySaver, StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";
// import { MedGather } from "./models";
// import { medGatherPrompt } from "./prompts";
// import { AIMessage } from "node_modules/@langchain/core/dist/messages/ai";
// // import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";


// const State = new StateSchema({
//   messages: MessagesValue,
// });

// const mcqNode: GraphNode<typeof State> = async (state) => {
//     const lastMessage = state.messages[state.messages.length - 1];
//      const message = lastMessage?.content as string;
//      if (!message) {
//         throw new Error("Missing message in the state.");
//     }

//     const medGather = llm.withStructuredOutput(mcqSchema, {
//         name: "generate_mcq"
//     });

//     const structuredResponse = await personaPrompt("mcq").pipe(llmWithStructuredOutput).invoke({ content: document, query: message });
    
//     return { 
//         messages:[new AIMessage({ content: JSON.stringify(structuredResponse) })] 
//     };
// };

// const multiPersonaNode: GraphNode<typeof State> = async (state) => {
//     const message = state.messages[state.messages.length - 1]?.content as string;
//     const lastMessage = state.messages[state.messages.length - 1];
//     const document = lastMessage?.additional_kwargs?.document as string;
//     const persona = lastMessage?.additional_kwargs?.persona as keyof typeof personaPrompts;

//     if (!document || !message) {
//         throw new Error("Missing document or message in the state.");
//     }

//     const aiMsg = await personaPrompt(persona).pipe(llm).invoke({ content: document, query: message });
//     return { messages: [aiMsg] };
// }

// const checkpointer = new MemorySaver();
// // const checkpointer = PostgresSaver.fromConnString(
// //     process.env.DATABASE_URL as string,
// //     {
// //         schema: "public",
// //     }
// // )

// // await checkpointer.setup();

// export const graph = new StateGraph(State)
//   .addNode("medGatherNode", medGatherNode)
//   .addNode("multiPersonaNode", multiPersonaNode)
//   .addConditionalEdges(START, routePersona, {
//       mcqNode: "mcqNode",
//       multiPersonaNode: "multiPersonaNode"
//   })
//   .addEdge("mcqNode", END)
//   .addEdge("multiPersonaNode", END)
//   .compile({ checkpointer });