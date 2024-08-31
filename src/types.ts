export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  subtasks: Subtask[];
}

export interface Subtask {
  id: number;
  text: string;
  completed: boolean;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}
