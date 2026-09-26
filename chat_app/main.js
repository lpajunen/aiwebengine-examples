/// <reference path="../types/aiwebengine.d.ts" />

// Real-Time Chat Application
// Demonstrates filtered SSE stream messaging, persistent storage, and authentication

// ============================================
// Storage Layer - Helper Functions
// ============================================

/** @returns {Array<Record<string, any>>} */
function loadChannels() {
  try {
    const data = scriptStorage.getItem("chat:channels");
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading channels: " + error);
    return [];
  }
}

/** @param {Array<Record<string, any>>} channels */
function saveChannels(channels) {
  try {
    scriptStorage.setItem("chat:channels", JSON.stringify(channels));
    return true;
  } catch (error) {
    console.error("Error saving channels: " + error);
    return false;
  }
}

/**
 * @param {string} channelId
 * @param {number} [limit]
 * @returns {Array<Record<string, any>>}
 */
function loadMessages(channelId, limit) {
  try {
    const key = "chat:messages:" + channelId;
    const data = scriptStorage.getItem(key);
    const messages = data ? JSON.parse(data) : [];

    // Return last N messages
    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }
    return messages;
  } catch (error) {
    console.error(
      "Error loading messages for channel " + channelId + ": " + error,
    );
    return [];
  }
}

/**
 * @param {string} channelId
 * @param {Record<string, any>} message
 */
function saveMessage(channelId, message) {
  try {
    const key = "chat:messages:" + channelId;
    const messages = loadMessages(channelId);
    messages.push(message);

    // Keep only last 1000 messages per channel to prevent unbounded growth
    const trimmedMessages =
      messages.length > 1000 ? messages.slice(-1000) : messages;

    scriptStorage.setItem(key, JSON.stringify(trimmedMessages));
    return true;
  } catch (error) {
    console.error(
      "Error saving message to channel " + channelId + ": " + error,
    );
    return false;
  }
}

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// Where the chat UI's EventSource connects, and what sendStreamMessageFiltered
// pushes messages to.
const CHAT_STREAM_PATH = "/chat/events";

const CHAT_EMPTY_REQUEST = /** @type {HttpRequest} */ ({
  path: "",
  method: "GET",
  headers: /** @type {Headers & Record<string, string>} */ (new Headers()),
  query: {},
  params: {},
  form: {},
  body: "",
  searchParams: new URLSearchParams(),
  text: () => "",
  json: () => ({}),
  files: [],
});

// ============================================
// Request Helpers
// ============================================

/**
 * @param {HttpRequest} req
 * @returns {{id: string | null, name: string, email: string | null}}
 */
function requireChatUser(req) {
  const auth = req.auth;
  if (!auth || !auth.isAuthenticated) {
    throw new Error("Authentication required");
  }
  return {
    id: auth.userId,
    name: auth.userName || auth.userEmail || "unknown",
    email: auth.userEmail,
  };
}

/**
 * @param {HttpRequest} req
 * @returns {Record<string, any> | null} the parsed object, or null when the
 *   body is not a JSON object
 */
function readJsonBody(req) {
  if (!req.body) {
    return {};
  }
  try {
    const parsed = JSON.parse(req.body);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

// ============================================
// HTTP Handlers - JSON API
// ============================================

/**
 * Every API route answers JSON, errors included, so the browser can read the
 * message off the response body whatever the status is.
 *
 * @param {number} status
 * @param {string} message
 */
function chatError(status, message) {
  return ResponseBuilder.json({ error: message }, status);
}

/** @param {HandlerContext} context */
function channelsHandler(context) {
  const req = context.request || CHAT_EMPTY_REQUEST;
  try {
    requireChatUser(req);
    return ResponseBuilder.json({ channels: loadChannels() });
  } catch (error) {
    console.error("Error in channelsHandler: " + error);
    return chatError(401, getErrorMessage(error));
  }
}

/** @param {HandlerContext} context */
function messagesHandler(context) {
  const req = context.request || CHAT_EMPTY_REQUEST;
  try {
    requireChatUser(req);
  } catch (error) {
    return chatError(401, getErrorMessage(error));
  }

  try {
    const query = req.query || {};
    const channelId = query.channelId;
    const limit = query.limit ? parseInt(String(query.limit), 10) : 50;

    if (!channelId) {
      return chatError(400, "channelId is required");
    }

    return ResponseBuilder.json({
      messages: loadMessages(String(channelId), limit),
    });
  } catch (error) {
    console.error("Error in messagesHandler: " + error);
    return chatError(500, "Failed to load messages: " + getErrorMessage(error));
  }
}

/** @param {HandlerContext} context */
function currentUserHandler(context) {
  const req = context.request || CHAT_EMPTY_REQUEST;
  try {
    const user = requireChatUser(req);
    return ResponseBuilder.json({ user: user });
  } catch (error) {
    console.error("Error in currentUserHandler: " + error);
    return chatError(401, getErrorMessage(error));
  }
}

/** @param {HandlerContext} context */
function createChannelHandler(context) {
  const req = context.request || CHAT_EMPTY_REQUEST;
  /** @type {{id: string | null, name: string, email: string | null}} */
  let user;
  try {
    user = requireChatUser(req);
  } catch (error) {
    return chatError(401, getErrorMessage(error));
  }

  try {
    const body = readJsonBody(req);
    if (!body) {
      return chatError(400, "Request body must be a JSON object");
    }

    const name = body.name ? String(body.name) : "";
    const isPrivate = body.isPrivate === true;

    if (name.trim().length === 0) {
      return chatError(400, "Channel name is required");
    }

    if (name.length > 50) {
      return chatError(400, "Channel name must be 50 characters or less");
    }

    const channels = loadChannels();

    // Check if channel with same name exists
    const existing = channels.find(function (ch) {
      return ch.name.toLowerCase() === name.toLowerCase();
    });

    if (existing) {
      return chatError(409, "Channel with this name already exists");
    }

    // Create new channel
    const channelId =
      "channel_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const newChannel = {
      id: channelId,
      name: name,
      isPrivate: isPrivate,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    };

    channels.push(newChannel);
    saveChannels(channels);

    console.log("Channel created: " + name + " by " + user.name);

    return ResponseBuilder.json({ channel: newChannel }, 201);
  } catch (error) {
    console.error("Error in createChannelHandler: " + error);
    return chatError(
      500,
      "Failed to create channel: " + getErrorMessage(error),
    );
  }
}

/** @param {HandlerContext} context */
function sendMessageHandler(context) {
  const req = context.request || CHAT_EMPTY_REQUEST;
  /** @type {{id: string | null, name: string, email: string | null}} */
  let user;
  try {
    user = requireChatUser(req);
  } catch (error) {
    return chatError(401, getErrorMessage(error));
  }

  try {
    const body = readJsonBody(req);
    if (!body) {
      return chatError(400, "Request body must be a JSON object");
    }

    const channelId = body.channelId ? String(body.channelId) : "";
    const text = body.text ? String(body.text) : "";

    if (!channelId) {
      return chatError(400, "channelId is required");
    }

    if (text.trim().length === 0) {
      return chatError(400, "Message text is required");
    }

    if (text.length > 2000) {
      return chatError(400, "Message must be 2000 characters or less");
    }

    // Verify channel exists
    const channels = loadChannels();
    const channel = channels.find(function (ch) {
      return ch.id === channelId;
    });

    if (!channel) {
      return chatError(404, "Channel not found");
    }

    // Create message
    const message = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      sender: user.name,
      text: text,
      timestamp: new Date().toISOString(),
      type: "user_message",
    };

    // Save to storage
    saveMessage(channelId, message);

    // Push to the stream connections that subscribed to this channel. The
    // filter is matched against the metadata chatStreamCustomizer returned
    // when each connection opened.
    routeRegistry.sendStreamMessageFiltered(
      CHAT_STREAM_PATH,
      message,
      JSON.stringify({ channelId: channelId }),
    );

    console.log(
      "Message sent to channel " + channelId + " by " + message.sender,
    );

    return ResponseBuilder.json({ message: message }, 201);
  } catch (error) {
    console.error("Error in sendMessageHandler: " + error);
    return chatError(500, "Failed to send message: " + getErrorMessage(error));
  }
}

// ============================================
// SSE Stream - Per-Channel Connection Filter
// ============================================

/**
 * Connection customizer for CHAT_STREAM_PATH. What it returns becomes the
 * connection's metadata, which sendStreamMessageFiltered matches against, so a
 * connection that opened with ?channelId=foo only receives foo's messages.
 * Returning an empty object leaves a connection that no filtered send matches.
 *
 * @param {HandlerContext} context
 */
function chatStreamCustomizer(context) {
  try {
    const req = context.request || CHAT_EMPTY_REQUEST;
    const queryParams = req.query || {};
    const channelId = queryParams.channelId;

    if (!channelId) {
      console.error("chatStreamCustomizer: no channelId in the query string");
      return {};
    }

    const auth = req.auth;
    if (!auth || !auth.isAuthenticated) {
      console.error("Authentication check failed for channel stream");
      return {};
    }

    const userLabel = auth.userName || auth.userEmail || "unknown";
    console.log("User " + userLabel + " subscribed to channel: " + channelId);

    return { channelId: String(channelId) };
  } catch (error) {
    console.error("Error in chatStreamCustomizer: " + error);
    return {};
  }
}

// ============================================
// HTTP Handler - Chat Interface
// ============================================

/** @param {HandlerContext} context */
function chatInterfaceHandler(context) {
  try {
    const req = context.request || CHAT_EMPTY_REQUEST;
    const auth = req.auth;
    // Require authentication
    if (!auth || !auth.isAuthenticated) {
      throw new Error("Authentication required");
    }
    const user = {
      id: auth.userId,
      name: auth.userName,
      email: auth.userEmail,
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real-Time Chat</title>
    <link rel="stylesheet" href="/engine.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .chat-container {
            width: 90%;
            max-width: 1200px;
            height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: #667eea;
            color: white;
            padding: 1rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .chat-header h1 {
            margin: 0;
            font-size: 1.5rem;
        }
        
        .user-info {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        
        .chat-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        
        .channels-sidebar {
            width: 250px;
            background: #f7f7f7;
            border-right: 1px solid #ddd;
            display: flex;
            flex-direction: column;
        }
        
        .channels-header {
            padding: 1rem;
            font-weight: 600;
            border-bottom: 1px solid #ddd;
        }
        
        .channels-list {
            flex: 1;
            overflow-y: auto;
        }
        
        .channel-item {
            padding: 0.75rem 1rem;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            transition: background 0.2s;
        }
        
        .channel-item:hover {
            background: #e8e8e8;
        }
        
        .channel-item.active {
            background: #667eea;
            color: white;
        }
        
        .channel-actions {
            padding: 1rem;
            border-top: 1px solid #ddd;
        }
        
        .messages-area {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .messages-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #ddd;
            font-weight: 600;
            background: #fafafa;
        }
        
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 1.5rem;
            background: #f9f9f9;
        }
        
        .message {
            margin-bottom: 1rem;
            padding: 0.75rem 1rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .message.system {
            background: #fff3cd;
            border-left: 3px solid #ffc107;
            font-style: italic;
        }
        
        .message-sender {
            font-weight: 600;
            color: #667eea;
            margin-bottom: 0.25rem;
        }
        
        .message-text {
            margin: 0.25rem 0;
            line-height: 1.5;
        }
        
        .message-timestamp {
            font-size: 0.75rem;
            color: #888;
        }
        
        .message-input-area {
            padding: 1rem 1.5rem;
            border-top: 1px solid #ddd;
            background: white;
        }
        
        .message-form {
            display: flex;
            gap: 0.5rem;
        }
        
        .message-input {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 1rem;
        }
        
        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5568d3;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #5a6268;
        }
        
        .status {
            font-size: 0.85rem;
            padding: 0.5rem 1rem;
            background: #d4edda;
            color: #155724;
            border-bottom: 1px solid #c3e6cb;
        }
        
        .status.disconnected {
            background: #f8d7da;
            color: #721c24;
            border-bottom: 1px solid #f5c6cb;
        }
        
        .loading {
            text-align: center;
            padding: 2rem;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>💬 Real-Time Chat</h1>
            <div class="user-info">Logged in as: ${user.name || user.email}</div>
        </div>
        
        <div id="status" class="status">Connecting...</div>
        
        <div class="chat-body">
            <div class="channels-sidebar">
                <div class="channels-header">Channels</div>
                <div id="channels-list" class="channels-list">
                    <div class="loading">Loading channels...</div>
                </div>
                <div class="channel-actions">
                    <button class="btn btn-secondary" onclick="createNewChannel()">+ New Channel</button>
                </div>
            </div>
            
            <div class="messages-area">
                <div id="messages-header" class="messages-header">Select a channel</div>
                <div id="messages-container" class="messages-container">
                    <div class="loading">No channel selected</div>
                </div>
                <div class="message-input-area">
                    <form id="message-form" class="message-form" onsubmit="sendMessage(event)">
                        <input 
                            type="text" 
                            id="message-input" 
                            class="message-input" 
                            placeholder="Type a message..." 
                            disabled
                            maxlength="2000"
                        />
                        <button type="submit" class="btn btn-primary" disabled>Send</button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentChannel = null;
        let channels = [];
        
        // Load channels on startup
        async function loadChannels() {
            try {
                const response = await fetch('/chat/api/channels');
                const result = await response.json();

                if (response.ok && result.channels) {
                    channels = result.channels;
                    renderChannels();
                    
                    // Auto-select system channel
                    if (channels.length > 0) {
                        const systemChannel = channels.find(ch => ch.id === 'system');
                        if (systemChannel) {
                            selectChannel(systemChannel.id);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading channels:', error);
                updateStatus('Failed to load channels', true);
            }
        }
        
        function renderChannels() {
            const list = document.getElementById('channels-list');
            list.innerHTML = channels.map(ch => 
                \`<div class="channel-item \${currentChannel && currentChannel.id === ch.id ? 'active' : ''}" 
                     onclick="selectChannel('\${ch.id}')">
                    \${ch.name}
                </div>\`
            ).join('');
        }
        
        async function selectChannel(channelId) {
            // Close existing subscription using abort controller
            if (currentSubscriptionController) {
                currentSubscriptionController.abort();
                currentSubscriptionController = null;
            }
            
            const channel = channels.find(ch => ch.id === channelId);
            if (!channel) return;
            
            currentChannel = channel;
            renderChannels();
            
            // Update header
            document.getElementById('messages-header').textContent = channel.name;
            
            // Enable message input
            document.getElementById('message-input').disabled = false;
            document.querySelector('#message-form button').disabled = false;
            
            // Load message history
            await loadMessages(channelId);
            
            // Subscribe to real-time updates
            subscribeToChannel(channelId);
        }
        
        async function loadMessages(channelId) {
            try {
                const response = await fetch('/chat/api/messages?channelId=' + encodeURIComponent(channelId) + '&limit=50');
                const result = await response.json();

                if (response.ok && result.messages) {
                    renderMessages(result.messages);
                }
            } catch (error) {
                console.error('Error loading messages:', error);
            }
        }
        
        function renderMessages(messages) {
            const container = document.getElementById('messages-container');
            
            if (messages.length === 0) {
                container.innerHTML = '<div class="loading">No messages yet. Start the conversation!</div>';
                return;
            }
            
            container.innerHTML = messages.map(msg => {
                const date = new Date(msg.timestamp);
                const time = date.toLocaleTimeString();
                const isSystem = msg.type === 'system_message';
                
                return \`<div class="message \${isSystem ? 'system' : ''}">
                    <div class="message-sender">\${msg.sender}</div>
                    <div class="message-text">\${escapeHtml(msg.text)}</div>
                    <div class="message-timestamp">\${time}</div>
                </div>\`;
            }).join('');
            
            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        }
        
        let currentSubscriptionController = null;
        
        function subscribeToChannel(channelId) {
            // Cancel any existing subscription
            if (currentSubscriptionController) {
                currentSubscriptionController.abort();
                currentSubscriptionController = null;
            }
            
            updateStatus('Connecting to ' + currentChannel.name + '...');
            
            // Create abort controller for this subscription (for compatibility)
            currentSubscriptionController = new AbortController();

            // Subscribe to the script's SSE stream. The channelId query
            // parameter is what chatStreamCustomizer turns into this
            // connection's filter, so only this channel's messages arrive.
            const eventSource = new EventSource('/chat/events?channelId=' + encodeURIComponent(channelId));

            eventSource.onopen = function(event) {
                updateStatus('Connected to ' + currentChannel.name);
                console.log('SSE connection opened for channel:', currentChannel.name);
            };

            eventSource.onmessage = function(event) {
                try {
                    const message = JSON.parse(event.data);

                    // Stream messages carry the message object as sent by
                    // sendStreamMessageFiltered; ignore keep-alives and
                    // anything without a message id.
                    if (message && message.id) {
                        addMessage(message);
                    }
                } catch (error) {
                    console.error('Error parsing SSE message:', error, 'Data:', event.data);
                }
            };

            eventSource.onerror = function(event) {
                console.error('SSE connection error for channel:', currentChannel.name, event);
                updateStatus('Connection interrupted', true);

                // Only reconnect if still on same channel
                setTimeout(() => {
                    if (currentChannel && currentChannel.id === channelId) {
                        console.log('Reconnecting after error...');
                        subscribeToChannel(channelId);
                    }
                }, 2000);
            };

            // Store the EventSource instance for potential cleanup
            window.chatEventSource = eventSource;
        }
        
        function addMessage(message) {
            const container = document.getElementById('messages-container');
            
            // Remove "no messages" placeholder if present
            if (container.querySelector('.loading')) {
                container.innerHTML = '';
            }
            
            const date = new Date(message.timestamp);
            const time = date.toLocaleTimeString();
            const isSystem = message.type === 'system_message';
            
            const messageEl = document.createElement('div');
            messageEl.className = 'message' + (isSystem ? ' system' : '');
            messageEl.innerHTML = \`
                <div class="message-sender">\${message.sender}</div>
                <div class="message-text">\${escapeHtml(message.text)}</div>
                <div class="message-timestamp">\${time}</div>
            \`;
            
            container.appendChild(messageEl);
            container.scrollTop = container.scrollHeight;
        }
        
        async function sendMessage(event) {
            event.preventDefault();
            
            const input = document.getElementById('message-input');
            const text = input.value.trim();
            
            if (!text || !currentChannel) return;
            
            try {
                const response = await fetch('/chat/api/messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ channelId: currentChannel.id, text: text }),
                });

                const result = await response.json();

                if (!response.ok) {
                    alert('Error sending message: ' + (result.error || response.status));
                } else {
                    input.value = '';
                }
            } catch (error) {
                console.error('Error sending message:', error);
                alert('Failed to send message');
            }
        }
        
        async function createNewChannel() {
            const name = prompt('Enter channel name:');
            if (!name) return;
            
            try {
                const response = await fetch('/chat/api/channels', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: name, isPrivate: false }),
                });

                const result = await response.json();

                if (!response.ok) {
                    alert('Error creating channel: ' + (result.error || response.status));
                } else {
                    // Reload channels
                    await loadChannels();

                    // Select the new channel
                    selectChannel(result.channel.id);
                }
            } catch (error) {
                console.error('Error creating channel:', error);
                alert('Failed to create channel');
            }
        }
        
        function updateStatus(message, isError) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status' + (isError ? ' disconnected' : '');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Initialize
        loadChannels();
    </script>
</body>
</html>`;

    return ResponseBuilder.html(html);
  } catch (error) {
    // User not authenticated, redirect to login
    const req = context.request || CHAT_EMPTY_REQUEST;
    const currentPath = encodeURIComponent(req.path || "/chat");
    const loginUrl = "/auth/login?redirect=" + currentPath;

    return ResponseBuilder.redirect(loginUrl);
  }
}

// ============================================
// Initialization
// ============================================

/** @param {HandlerContext} context */
function init(context) {
  console.log("Initializing chat_app.js at " + new Date().toISOString());

  try {
    // Initialize system channel if it doesn't exist
    let channels = loadChannels();
    const systemChannelExists = channels.some(function (ch) {
      return ch.id === "system";
    });

    if (!systemChannelExists) {
      const systemChannel = {
        id: "system",
        name: "System Announcements",
        isPrivate: false,
        createdBy: "System",
        createdAt: new Date().toISOString(),
      };

      channels.push(systemChannel);
      saveChannels(channels);

      console.log("System channel created");
    }

    // JSON API used by the chat UI (authentication required on every route)
    routeRegistry.registerRoute(
      "/chat/api/channels",
      "channelsHandler",
      "GET",
      {
        tags: ["Chat"],
        summary: "List channels",
      },
    );

    routeRegistry.registerRoute(
      "/chat/api/channels",
      "createChannelHandler",
      "POST",
      {
        tags: ["Chat"],
        summary: "Create a channel",
      },
    );

    routeRegistry.registerRoute(
      "/chat/api/messages",
      "messagesHandler",
      "GET",
      {
        tags: ["Chat"],
        summary: "Read a channel's message history",
      },
    );

    routeRegistry.registerRoute(
      "/chat/api/messages",
      "sendMessageHandler",
      "POST",
      {
        tags: ["Chat"],
        summary: "Post a message to a channel",
      },
    );

    routeRegistry.registerRoute("/chat/api/me", "currentUserHandler", "GET", {
      tags: ["Chat"],
      summary: "The authenticated user",
    });

    // Real-time updates: one SSE stream, filtered per channel by the
    // customizer's connection metadata
    routeRegistry.registerStreamRoute(
      CHAT_STREAM_PATH,
      "chatStreamCustomizer",
      {
        tags: ["Chat"],
        summary: "Live messages for one channel (?channelId=...)",
      },
    );

    // Register HTTP route for chat interface
    routeRegistry.registerRoute("/chat", "chatInterfaceHandler", "GET");

    console.log("Chat application initialized successfully");
    console.log("Access the chat at /chat (authentication required)");
  } catch (error) {
    console.error("Error initializing chat application: " + error);
    throw error;
  }
}
