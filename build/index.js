"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load up env file which contains credentials
dotenv_1.default.config({ path: `.env.${process.env.NODE_ENV}` });
const server_1 = require("./server");
const server = new server_1.Server();
server.listen(3000);
