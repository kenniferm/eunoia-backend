import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import expressWs from 'express-ws';
import session from 'express-session';
import { RawData, WebSocket } from 'ws';
import path from 'path';
import { authMiddleware, loginHandler } from './authMiddleware';
import { RetellClient } from 'retell-sdk';
import {
  AudioWebsocketProtocol,
  AudioEncoding,
} from 'retell-sdk/models/components';
import { FunctionCallingLlmClient } from './llm_azure_openai_func_call';
import dotenv from 'dotenv';

// Load up env file which contains credentials
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;
  private retellClient: RetellClient;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    // Session middleware
    this.app.use(session({
      secret: 'your_secret_key',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }
    }));

    // Serve static files from the public directory
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Public login route
    this.app.post('/login', loginHandler);

    // Protect all other routes and serve the login page if not authenticated
    this.app.use(authMiddleware);

    // Serve the main app (index.html) for authenticated users
    this.app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    this.handleRetellLlmWebSocket();
    this.handleRegisterCallAPI();

    this.retellClient = new RetellClient({
      apiKey: process.env.RETELL_API_KEY,
    });
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log('Listening on ' + port);
  }

  // Only used for web frontend to register call so that frontend doesn't need api key
  handleRegisterCallAPI() {
    this.app.post(
      '/register-call-on-your-server',
      async (req: Request, res: Response) => {
        // Extract agentId from request body; apiKey should be securely stored and not passed from the client
        const { agentId } = req.body;

        try {
          const callResponse = await this.retellClient.registerCall({
            agentId: agentId,
            audioWebsocketProtocol: AudioWebsocketProtocol.Web,
            audioEncoding: AudioEncoding.S16le,
            sampleRate: 24000,
          });
          // Send back the successful response to the client
          res.json(callResponse.callDetail);
        } catch (error) {
          console.error('Error registering call:', error);
          // Send an error response back to the client
          res.status(500).json({ error: 'Failed to register call' });
        }
      },
    );
  }

  handleRetellLlmWebSocket() {
    this.app.ws(
      '/llm-websocket/:call_id',
      async (ws: WebSocket, req: Request) => {
        const callId = req.params.call_id;
        console.log('Handle llm ws for: ', callId);

        const llmClient = new FunctionCallingLlmClient();
        // Start sending the begin message to signal the client is ready.
        llmClient.BeginMessage(ws);

        ws.on('error', (err) => {
          console.error('Error received in LLM websocket client: ', err);
        });
        ws.on('close', (err) => {
          console.error('Closing llm ws for: ', callId);
        });

        ws.on('message', async (data: RawData, isBinary: boolean) => {
          if (isBinary) {
            console.error('Received binary message, expected text.');
            // Consider how to handle binary messages, if they're expected at all.
            return;
          }

          let request;
          try {
            request = JSON.parse(data.toString());
          } catch (err) {
            console.error('Error parsing JSON from message:', data.toString(), err);
            // Optionally, send an error response back to the client instead of closing.
            return;
          }

          // Proceed with handling the request now that it's successfully parsed
          try {
            llmClient.DraftResponse(request, ws);
          } catch (error) {
            console.error('Error handling request:', request, error);
            // Handle the error appropriately without necessarily closing the WS
          }
        });
      },
    );
  }
}

// Start the server
const server = new Server();
server.listen(8080);