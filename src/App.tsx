import { useState, useEffect, useRef } from "react";
import OpenAI from "openai";
import { usePGlite } from "@electric-sql/pglite-react";
import classNames from "classnames";
import { CheckIcon } from "@heroicons/react/20/solid";
import {
  addTodosTool,
  addSubtasksTool,
  completeTodosTool,
  completeSubtasksTool,
  uncompleteTodosTool,
  uncompleteSubtasksTool,
  deleteTodosTool,
  deleteSubtasksTool,
} from "./tools";
import {
  refreshTodos,
  addTodos,
  addSubtasks,
  completeTodos,
  completeSubtasks,
  uncompleteTodos,
  uncompleteSubtasks,
  deleteTodos,
  deleteSubtasks,
} from "./functions";
import { Todo, Message } from "./types";

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

function App() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: `
      You are an AI assistant that helps manage a todo list. You can
      add new todos with subtasks, add subtasks to existing todos,
      mark todos or subtasks as completed or incomplete, or delete
      todos and subtasks. I will provide you with the current state
      of the todo list in each interaction. Keep your responses to
      the user short and sweet, wihtout unnecessary details.`,
    },
    {
      role: "assistant",
      content: "How can I help you with your tasks today?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const db = usePGlite();

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const initDb = async () => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS todos (
          id SERIAL PRIMARY KEY,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS subtasks (
          id SERIAL PRIMARY KEY,
          todo_id INTEGER REFERENCES todos(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT FALSE
        );
      `);
      const updatedTodos = await refreshTodos(db);
      setTodos(updatedTodos);
    };
    initDb();
  }, [db]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async () => {
    if (chatInput.trim() === "") return;

    const userMessage = { role: "user", content: chatInput } as Message;
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setChatInput("");
    setIsLoading(true);

    const newMessages = [...messages, userMessage];

    let continueProcessing = true;
    while (continueProcessing) {
      const todoContext =
        todos.length > 0
          ? todos
              .map(
                (todo) =>
                  `ID: ${todo.id}, Text: "${todo.text}", Completed: ${todo.completed}, Subtasks: [${todo.subtasks
                    .map(
                      (st) =>
                        `{ID: ${st.id}, Text: "${st.text}", Completed: ${st.completed}}`,
                    )
                    .join(", ")}]`,
              )
              .join("\n")
          : "No todos currently.";

      const todoContextMessage: Message = {
        role: "system",
        content: `Current todo list:\n${todoContext}${
          todos.length > 0
            ? "\n\nPlease use the todo IDs when referring to specific todos."
            : ""
        }`,
      };

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            ...newMessages,
            todoContextMessage,
          ] as OpenAI.ChatCompletionMessageParam[],
          tools: [
            addTodosTool,
            addSubtasksTool,
            completeTodosTool,
            completeSubtasksTool,
            uncompleteTodosTool,
            uncompleteSubtasksTool,
            deleteTodosTool,
            deleteSubtasksTool,
          ],
          tool_choice: "auto",
          parallel_tool_calls: false,
        });

        const assistantMessage = response.choices[0].message;
        newMessages.push(assistantMessage as Message);

        if (
          assistantMessage.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          for (const toolCall of assistantMessage.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            let result;
            console.log(toolCall);
            switch (toolCall.function.name) {
              case "addTodos":
                result = await addTodos(db, args.todos);
                break;
              case "addSubtasks":
                result = await addSubtasks(db, args.todoId, args.subtasks);
                break;
              case "completeTodos":
                result = await completeTodos(db, args.ids);
                break;
              case "completeSubtasks":
                result = await completeSubtasks(db, args.subtaskIds);
                break;
              case "uncompleteTodos":
                result = await uncompleteTodos(db, args.ids);
                break;
              case "uncompleteSubtasks":
                result = await uncompleteSubtasks(db, args.subtaskIds);
                break;
              case "deleteTodos":
                result = await deleteTodos(db, args.ids);
                break;
              case "deleteSubtasks":
                result = await deleteSubtasks(db, args.subtaskIds);
                break;
            }

            newMessages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            } as Message);
          }

          const updatedTodos = await refreshTodos(db);
          setTodos(updatedTodos);
        } else {
          // If there are no tool calls, we're done processing
          continueProcessing = false;
        }
      } catch (error) {
        console.error("Error calling OpenAI API:", error);
        continueProcessing = false;
      }
    }

    console.log("New messages", newMessages);
    setMessages(newMessages);
    setIsLoading(false);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4">
      <div className="flex flex-col lg:flex-row rounded-2xl border border-gray-200 w-full h-full overflow-hidden">
        <div className="h-4/6 lg:h-full lg:flex-grow border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto">
          {todos.length === 0 && (
            <div className="h-full w-full flex items-center justify-center">
              <div>
                <p>Create your first task</p>
                <p className="text-gray-500">Chat with our AI assistant</p>
              </div>
            </div>
          )}
          {todos.length > 0 && (
            <ul className="flex flex-col">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="px-2.5 py-3 flex flex-col gap-1 border-b border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={classNames(
                        "rounded h-4 w-4 flex items-center justify-center",
                        {
                          "bg-black text-white": todo.completed,
                          "bg-white border border-gray-300": !todo.completed,
                        },
                      )}
                    >
                      {todo.completed && <CheckIcon className="h-3 w-3" />}
                    </span>
                    <span>{todo.text}</span>
                  </div>
                  {todo.subtasks?.length > 0 && (
                    <ul className="pl-6 flex flex-col gap-1">
                      {todo.subtasks.map((subtask) => (
                        <li
                          key={subtask.id}
                          className="flex items-center gap-2"
                        >
                          <span
                            className={classNames(
                              "rounded h-4 w-4 flex items-center justify-center",
                              {
                                "bg-black text-white": subtask.completed,
                                "bg-white border border-gray-300":
                                  !subtask.completed,
                              },
                            )}
                          >
                            {subtask.completed && (
                              <CheckIcon className="h-3 w-3" />
                            )}
                          </span>
                          <span>{subtask.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="h-2/6 lg:h-full lg:w-[32rem] flex flex-col">
          <div className="flex-grow flex flex-col gap-6 overflow-y-auto px-4 pt-4 pb-16">
            {messages
              .filter(
                (message) =>
                  message.role === "user" ||
                  (message.role === "assistant" && message.content),
              )
              .map((message, index) => (
                <div
                  key={index}
                  className={classNames("w-fit", {
                    "ml-auto bg-gray-100 rounded-xl px-4 py-2 flex items-center max-w-[75%]":
                      message.role === "user",
                    "flex gap-2": message.role === "assistant",
                  })}
                >
                  {message.role === "assistant" && (
                    <span className="block h-2 w-2 bg-cyan-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                  <span>{message.content}</span>
                </div>
              ))}
            {isLoading && (
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full opacity-100 animate-pulse"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full opacity-100 animate-pulse [animation-delay:333ms]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full opacity-100 animate-pulse [animation-delay:666ms]"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form
            className="flex gap-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask for help with your tasks"
              className="flex-grow h-10 rounded-full px-4 bg-gray-100"
            />
            <button
              type="submit"
              className="bg-black rounded-full h-10 px-4 text-white disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
