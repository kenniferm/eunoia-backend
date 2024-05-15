import {
    OpenAIClient,
    AzureKeyCredential,
    ChatRequestMessage,
    GetChatCompletionsOptions,
    ChatCompletionsFunctionToolDefinition,
  } from "@azure/openai";
  import { WebSocket } from "ws";
  
  interface Utterance {
    role: "agent" | "user";
    content: string;
  }
  
  export interface RetellRequest {
    response_id?: number;
    transcript: Utterance[];
    interaction_type: "update_only" | "response_required" | "reminder_required";
  }
  
  export interface RetellResponse {
    response_id?: number;
    content: string;
    content_complete: boolean;
    end_call: boolean;
  }
  
  //Step 1: Define the structure to parse openAI function calling result to our data model
  export interface FunctionCall {
    id: string;
    funcName: string;
    arguments: Record<string, any>;
    result?: string;
  }
  
  const beginSentence =
    "こんにちは。私はあなたのAIセラピストです。あなたのお悩みを教えてください。。";
  const agentPrompt =
    "会話スタイル：短く、明瞭な散文で、必ず3文以下の返答を目指してください。簡潔かつ会話的にコミュニケーションをとります。この簡潔なアプローチは、患者とのやりとりの際に明確さと焦点を維持するのに役立ちます。\n\nタスク：一流のカウンセラーとして、カウンセリングを行ってください。患者は不安を抽象的に捉えたまま、あなたに相談しています。ここでのタスクは、ユーザーの心理状況を理解することを目標とし、抽象的な不安を具体化することで言語化し、患者に自らが抱えている不安に「気づき」をもたらすことです。会話をリードしつつ、相手に「気づき」を与えられるようなクリティカルな質問を繰り返してください。あなたが十分な情報を得られたと感じた時や、ユーザーが十分自分の状態について言語化できたと感じたら、進行中の評価を実施して患者の進捗を監視し、適切な場合には家族を巻き込んで助言し、必要に応じて患者を外部の専門家や機関に紹介します。\n\n人格：あなたのアプローチは共感的で理解があるものでなければならず、患者にとって最善のアプローチであることを維持しながら、同情心やプロフェッショナルのバランスをとることを留意するです。積極的に聞き、過度に同意することなく共感を示し、あなたのプロフェッショナルな意見が治療プロセスを導くことを確実にすることが重要です。";
  
  export class FunctionCallingLlmClient {
    private client: OpenAIClient;
  
    constructor() {
      this.client = new OpenAIClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
      );
    }
  
    // First sentence requested
    BeginMessage(ws: WebSocket) {
      const res: RetellResponse = {
        response_id: 0,
        content: beginSentence,
        content_complete: true,
        end_call: false,
      };
      ws.send(JSON.stringify(res));
    }
  
    private ConversationToChatRequestMessages(conversation: Utterance[]) {
      let result: ChatRequestMessage[] = [];
      for (let turn of conversation) {
        result.push({
          role: turn.role === "agent" ? "assistant" : "user",
          content: turn.content,
        });
      }
      return result;
    }
  
    private PreparePrompt(request: RetellRequest) {
      let transcript = this.ConversationToChatRequestMessages(request.transcript);
      let requestMessages: ChatRequestMessage[] = [
        {
          role: "system",
          content:
            '##目的\nあなたは、会話型AIセラピストとして、ユーザーと人間らしい会話を行います。そして、与えられた指示と提供されたトランスクリプトに基づいて応答します。可能な限り人間らしくすることを心がけてください。\n\n会話のスタイルに関して\n* [簡潔に] 簡潔に、短く、すぐに要点を押さえて応答してください。一度に一つの質問やアクション項目にのみ対応することを心がけてください。一つの発話に全てを詰め込まないでください。\n* [繰り返さない] 会話内ににある内容を繰り返さないでください。ポイントを再度言及する必要がある場合は、表現を言い換えてください。各応答がユニークでパーソナライズされていることを保証するために、さまざまな構文と語彙を使用して、ユーザーとエンゲージください。\n* [会話的である] まるで親しい友人に話しているかのように、日常的な言葉を使い、人間らしくしてください。時々、「フィラーワード」を加えながら、文章を短く保ってください。難しい単語を使ったり、あまりにも公式な話し方は必ず避けてください。\n* [積極的である] 会話をリードし、受動的でいないでください。全ての会話において、質問や次のステップの提案でユーザーに働きかけてください。\n\n応答ガイドライン\n* [ASRエラーを克服する] これはリアルタイムのトランスクリプトであり、エラーが発生することが期待されます。ユーザーが何を言おうとしているか推測できる場合は、推測して応答してください。明確にする必要がある場合は、音声を聞いたかのようにくだけた表現を使ってください（「それは聞き取れなかった」「何か雑音が」「すみません」「途切れ途切れに聞こえる」「話し声に静電気が」「声が途中で切れている」など）。決して「転写エラー」と言わず、繰り返さないでください。\n* [常にあなたの役割を守る] あなたの役割ができること、できないことを考えてください。もし役割が何かをすることができない場合は、会話の目標とあなたの役割へと会話を戻そうとしてください。これを行う際に繰り返さないでください。それでも創造的で、人間らしく、活気があるようにしてください。\n* [スムーズな会話を作る] あなたの応答はあなたの役割に合っているだけでなく、リアルタイムの通話セッションにフィットして、人間らしい会話を作るべきです。ユーザーがちょうど言ったことに直接応答してください。\n\n## Role\n' +
            agentPrompt,
        },
      ];
      for (const message of transcript) {
        requestMessages.push(message);
      }
      if (request.interaction_type === "reminder_required") {
        requestMessages.push({
          role: "user",
          content: "(Now the user has not responded in a while, you would say:)",
        });
      }
      return requestMessages;
    }
  
    // Step 2: Prepare the function calling definition to the prompt
    private PrepareFunctions(): ChatCompletionsFunctionToolDefinition[] {
      let functions: ChatCompletionsFunctionToolDefinition[] = [
        {
          type: "function",
          function: {
            name: "end_call",
            description: "End the call only when user explicitly requests it.",
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description:
                    "The message you will say before ending the call with the customer.",
                },
              },
              required: ["message"],
            },
          },
        },
      ];
      return functions;
    }
  
    async DraftResponse(request: RetellRequest, ws: WebSocket) {
      console.clear();
      console.log("req", request);
  
      if (request.interaction_type === "update_only") {
        // process live transcript update if needed
        return;
      }
      const requestMessages: ChatRequestMessage[] = this.PreparePrompt(request);
  
      const option: GetChatCompletionsOptions = {
        temperature: 0.5,
        maxTokens: 500,
        frequencyPenalty: 1,
        // Step 3: Add the function into your request
        tools: this.PrepareFunctions(),
      };
  
      let funcCall: FunctionCall;
      let funcArguments = "";
  
      try {
        let events = await this.client.streamChatCompletions(
          process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          requestMessages,
          option,
        );
  
        for await (const event of events) {
          if (event.choices.length >= 1) {
            let delta = event.choices[0].delta;
            if (!delta) continue;
  
            // Step 4: Extract the functions
            if (delta.toolCalls.length >= 1) {
              const toolCall = delta.toolCalls[0];
              // Function calling here.
              if (toolCall.id) {
                if (funcCall) {
                  // Another function received, old function complete, can break here.
                  break;
                } else {
                  funcCall = {
                    id: toolCall.id,
                    funcName: toolCall.function.name || "",
                    arguments: {},
                  };
                }
              } else {
                // append argument
                funcArguments += toolCall.function?.arguments || "";
              }
            } else if (delta.content) {
              const res: RetellResponse = {
                response_id: request.response_id,
                content: delta.content,
                content_complete: false,
                end_call: false,
              };
              ws.send(JSON.stringify(res));
            }
          }
        }
      } catch (err) {
        console.error("Error in gpt stream: ", err);
      } finally {
        if (funcCall != null) {
          // Step 5: Call the functions
          if (funcCall.funcName === "end_call") {
            funcCall.arguments = JSON.parse(funcArguments);
            const res: RetellResponse = {
              response_id: request.response_id,
              content: funcCall.arguments.message,
              content_complete: true,
              end_call: true,
            };
            ws.send(JSON.stringify(res));
          }
        } else {
          const res: RetellResponse = {
            response_id: request.response_id,
            content: "",
            content_complete: true,
            end_call: false,
          };
          ws.send(JSON.stringify(res));
        }
      }
    }
  }
  