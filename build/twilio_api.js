"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioClient = void 0;
const VoiceResponse_1 = __importDefault(require("twilio/lib/twiml/VoiceResponse"));
const twilio_1 = __importDefault(require("twilio"));
class TwilioClient {
    constructor(retellClient) {
        // Create a new phone number and route it to use this server.
        this.CreatePhoneNumber = async (areaCode, agentId) => {
            try {
                const localNumber = await this.twilio
                    .availablePhoneNumbers("US")
                    .local.list({ areaCode: areaCode, limit: 1 });
                if (!localNumber || localNumber[0] == null)
                    throw "No phone numbers of this area code.";
                const phoneNumberObject = await this.twilio.incomingPhoneNumbers.create({
                    phoneNumber: localNumber[0].phoneNumber,
                    voiceUrl: `${process.env.NGROK_IP_ADDRESS}/twilio-voice-webhook/${agentId}`,
                });
                console.log("Getting phone number:", phoneNumberObject);
                return phoneNumberObject;
            }
            catch (err) {
                console.error("Create phone number API: ", err);
            }
        };
        // Update this phone number to use provided agent id. Also updates voice URL address.
        this.RegisterInboundAgent = async (number, agentId) => {
            try {
                const phoneNumberObjects = await this.twilio.incomingPhoneNumbers.list();
                let numberSid;
                for (const phoneNumberObject of phoneNumberObjects) {
                    if (phoneNumberObject.phoneNumber === number) {
                        numberSid = phoneNumberObject.sid;
                    }
                }
                if (numberSid == null) {
                    return console.error("Unable to locate this number in your Twilio account, is the number you used in BCP 47 format?");
                }
                await this.twilio.incomingPhoneNumbers(numberSid).update({
                    voiceUrl: `${process.env.NGROK_IP_ADDRESS}/twilio-voice-webhook/${agentId}`,
                });
            }
            catch (error) {
                console.error("failer to retrieve caller information: ", error);
            }
        };
        // Release a phone number
        this.DeletePhoneNumber = async (phoneNumberKey) => {
            await this.twilio.incomingPhoneNumbers(phoneNumberKey).remove();
        };
        // Create an outbound call
        this.CreatePhoneCall = async (fromNumber, toNumber, agentId) => {
            try {
                await this.twilio.calls.create({
                    machineDetection: "Enable",
                    machineDetectionTimeout: 8,
                    asyncAmd: "true",
                    asyncAmdStatusCallback: `${process.env.NGROK_IP_ADDRESS}/twilio-voice-webhook/${agentId}`,
                    url: `${process.env.NGROK_IP_ADDRESS}/twilio-voice-webhook/${agentId}`,
                    to: toNumber,
                    from: fromNumber,
                });
                console.log(`Call from: ${fromNumber} to: ${toNumber}`);
            }
            catch (error) {
                console.error("failer to retrieve caller information: ", error);
            }
        };
        // Use LLM function calling or some kind of parsing to determine when to let AI end the call
        this.EndCall = async (sid) => {
            try {
                const call = await this.twilio.calls(sid).update({
                    twiml: "<Response><Hangup></Hangup></Response>",
                });
                console.log("End phone call: ", call);
            }
            catch (error) {
                console.error("Twilio end error: ", error);
            }
        };
        // Use LLM function calling or some kind of parsing to determine when to transfer away this call
        this.TransferCall = async (sid, transferTo) => {
            try {
                const call = await this.twilio.calls(sid).update({
                    twiml: `<Response><Dial>${transferTo}</Dial></Response>`,
                });
                console.log("Transfer phone call: ", call);
            }
            catch (error) {
                console.error("Twilio transfer error: ", error);
            }
        };
        /* Twilio voice webhook. This will be called whenever there is an incoming or outgoing call.
           Register call with Retell at this stage and pass in returned call_id to Retell*/
        this.ListenTwilioVoiceWebhook = (app) => {
            app.post("/twilio-voice-webhook/:agent_id", async (req, res) => {
                const agent_id = req.params.agent_id;
                const { AnsweredBy, from, to, callSid } = req.body;
                try {
                    // Respond with TwiML to hang up the call if its machine)
                    if (AnsweredBy && AnsweredBy === "machine_start") {
                        this.EndCall(req.body.CallSid);
                        return;
                    }
                    else if (AnsweredBy) {
                        return;
                    }
                    const callResponse = await this.retellClient.call.register({
                        agent_id: agent_id,
                        audio_websocket_protocol: "twilio",
                        audio_encoding: "mulaw",
                        sample_rate: 8000,
                        from_number: from,
                        to_number: to,
                        metadata: { twilio_call_sid: callSid },
                    });
                    if (callResponse) {
                        // Start phone call websocket
                        const response = new VoiceResponse_1.default();
                        const start = response.connect();
                        const stream = start.stream({
                            url: `wss://api.retellai.com/audio-websocket/${callResponse.call_id}`,
                        });
                        res.set("Content-Type", "text/xml");
                        res.send(response.toString());
                    }
                }
                catch (err) {
                    console.error("Error in twilio voice webhook:", err);
                    res.status(500).send();
                }
            });
        };
        this.twilio = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_ID, process.env.TWILIO_AUTH_TOKEN);
        this.retellClient = retellClient;
    }
}
exports.TwilioClient = TwilioClient;
