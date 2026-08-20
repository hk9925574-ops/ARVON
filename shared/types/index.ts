export type MessageType = "ping" | "pong" | "system_status" | "error" | "voice_command" | "voice_response" | "ai_request" | "ai_response" | "memory_update" | "text_request" | "core_state" | "get_memories" | "forget_memory" | "clear_memories" | "memories_list" | "tts_speak" | "update_speech_settings" | "confirm_action" | "ACTION_LOGGED" | "CONFIRM_REQUIRED" | "get_vector_memories" | "forget_vector_memory" | "clear_vector_memories" | "vector_memories_list" | "agent_progress" | "agent_complete" | "get_agents" | "active_agents_list" | "terminal_output" | "audio_stream_chunk" | "transcribe_audio" | "transcribe_result";

export interface BaseMessage {
  type: MessageType;
  requestId?: string;
}

export interface PingMessage extends BaseMessage {
  type: "ping";
  payload: {
    message: string;
  };
}

export interface PongMessage extends BaseMessage {
  type: "pong";
  payload: {
    message: string;
  };
}

export interface SystemStatusMessage extends BaseMessage {
  type: "system_status";
  payload: {
    status: "connected" | "disconnected";
  };
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  payload: {
    error: string;
  };
}

export interface VoiceCommandMessage extends BaseMessage {
  type: "voice_command";
  payload: {
    text: string;
  };
}

export interface VoiceResponseMessage extends BaseMessage {
  type: "voice_response";
  payload: {
    text: string;
  };
}

export interface AIRequestMessage extends BaseMessage {
  type: "ai_request";
  payload: {
    text: string;
  };
}

export interface TextRequestMessage extends BaseMessage {
  type: "text_request";
  payload: {
    text: string;
    speechEnabled?: boolean;
    attachments?: { name: string; mimeType: string; data: string }[];
  };
}

export interface AIResponseMessage extends BaseMessage {
  type: "ai_response";
  payload: {
    text: string;
    format?: string;
  };
}

export interface CoreStateMessage extends BaseMessage {
  type: "core_state";
  payload: {
    state: string;
    details: string;
  };
}

export interface MemoryUpdateMessage extends BaseMessage {
  type: "memory_update";
  payload: {
    key: string;
    value: string;
  };
}

export interface GetMemoriesMessage extends BaseMessage {
  type: "get_memories";
  payload: {};
}

export interface ForgetMemoryMessage extends BaseMessage {
  type: "forget_memory";
  payload: {
    category: any;
    key: string;
  };
}

export interface ClearMemoriesMessage extends BaseMessage {
  type: "clear_memories";
  payload: {};
}

export interface MemoriesListMessage extends BaseMessage {
  type: "memories_list";
  payload: any[];
}

export interface TTSSpeakMessage extends BaseMessage {
  type: "tts_speak";
  payload: {
    text: string;
  };
}

export interface UpdateSpeechSettingsMessage extends BaseMessage {
  type: "update_speech_settings";
  payload: {
    speechEnabled: boolean;
  };
}

export interface ConfirmActionMessage extends BaseMessage {
  type: "confirm_action";
  payload: {
    executionId: string;
    confirmed: boolean;
  };
}

export interface ActionLoggedMessage extends BaseMessage {
  type: "ACTION_LOGGED";
  payload: any;
}

export interface ConfirmRequiredMessage extends BaseMessage {
  type: "CONFIRM_REQUIRED";
  payload: any;
}

export interface GetVectorMemoriesMessage extends BaseMessage {
  type: "get_vector_memories";
  payload: {};
}

export interface ForgetVectorMemoryMessage extends BaseMessage {
  type: "forget_vector_memory";
  payload: { id: string; };
}

export interface ClearVectorMemoriesMessage extends BaseMessage {
  type: "clear_vector_memories";
  payload: {};
}

export interface VectorMemoriesListMessage extends BaseMessage {
  type: "vector_memories_list";
  payload: any[];
}

export interface AgentProgressMessage extends BaseMessage {
  type: "agent_progress";
  payload: { message: string; };
}

export interface AgentCompleteMessage extends BaseMessage {
  type: "agent_complete";
  payload: { result: string; };
}

export interface GetAgentsMessage extends BaseMessage {
  type: "get_agents";
  payload: {};
}

export interface ActiveAgentsListMessage extends BaseMessage {
  type: "active_agents_list";
  payload: { id: string, task: string, status: string, logs: string[] }[];
}

export interface TerminalOutputMessage extends BaseMessage {
  type: "terminal_output";
  payload: { chunk: string; command?: string };
}

export interface AudioStreamChunkMessage extends BaseMessage {
  type: "audio_stream_chunk";
  payload: ArrayBuffer;
}

export interface TranscribeAudioMessage extends BaseMessage {
  type: "transcribe_audio";
  payload: { audioData: string; };
}

export interface TranscribeResultMessage extends BaseMessage {
  type: "transcribe_result";
  payload: { text: string; };
}

export type ClientMessage = PingMessage | VoiceCommandMessage | AIRequestMessage | TextRequestMessage | GetMemoriesMessage | ForgetMemoryMessage | ClearMemoriesMessage | UpdateSpeechSettingsMessage | ConfirmActionMessage | GetVectorMemoriesMessage | ForgetVectorMemoryMessage | ClearVectorMemoriesMessage | GetAgentsMessage | TranscribeAudioMessage;
export type ServerMessage = PongMessage | SystemStatusMessage | ErrorMessage | VoiceResponseMessage | AIResponseMessage | MemoryUpdateMessage | CoreStateMessage | MemoriesListMessage | TTSSpeakMessage | ActionLoggedMessage | ConfirmRequiredMessage | VectorMemoriesListMessage | AgentProgressMessage | AgentCompleteMessage | ActiveAgentsListMessage | TerminalOutputMessage | AudioStreamChunkMessage | TranscribeResultMessage;
