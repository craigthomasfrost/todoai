import { useState, useEffect } from "react";
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
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const db = usePGlite();

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
          model: "gpt-4-0613",
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
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex gap-2 bg-gray-100 rounded-2xl border border-gray-200 p-2 h-[40rem]">
        <div className="w-[32rem] p-4 bg-white rounded-xl border border-gray-200 overflow-y-auto">
          {todos.length === 0 && (
            <div className="h-full w-full flex items-center justify-center">
              <p>No todos yet</p>
            </div>
          )}
          {todos.length > 0 && (
            <ul className="flex flex-col gap-3">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="bg-gray-100 rounded-lg px-2.5 py-2 flex flex-col gap-1"
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
        <div className="w-[32rem] p-2 flex flex-col">
          <div className="flex-grow flex flex-col gap-6 overflow-y-auto pb-16">
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
                    "ml-auto bg-white rounded-xl px-4 py-2 flex items-center max-w-[75%]":
                      message.role === "user",
                  })}
                >
                  {message.content}
                </div>
              ))}
            {isLoading && (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
              </div>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="What would you like help with?"
              className="flex-grow h-10 rounded-full px-4"
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
