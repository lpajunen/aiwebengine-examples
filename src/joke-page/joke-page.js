/// <reference path="../../types/aiwebengine.d.ts" />

// Joke page
// Handles HTTP requests and returns a random joke as an HTML page
// Includes feedback system with thumbs up/down voting per individual joke and persistent storage
// Also provides GraphQL query endpoint for fetching jokes

const jokes = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "What do you call a fake noodle? An impasta!",
  "Why did the scarecrow win an award? He was outstanding in his field!",
  "What do you call a bear with no teeth? A gummy bear!",
  "Why don't eggs tell jokes? They'd crack each other up!",
  "What do you call a sleeping bull? A dozer!",
  "Why did the coffee file a police report? It got mugged!",
  "What did the ocean say to the beach? Nothing, it just waved!",
  "Why don't skeletons fight each other? They don't have the guts!",
  "How do you organize a space party? You planet!",
  "What do you call a fish wearing a bowtie? Sofishticated!",
  "Why did the math book look so sad? Because it had too many problems!",
  "What did one wall say to the other wall? I'll meet you at the corner!",
  "Why don't you ever want to talk to a decimal? Because it's pointless!",
  "What do you call a can opener that doesn't work? A can't opener!",
  "Why did the kid bring a ladder to school? Because they wanted to go to high school!",
  "What do you call a boomerang that doesn't come back? A stick!",
  "Why don't oysters share their pearls? Because they're shellfish!",
  "What's the best thing about Switzerland? I don't know, but their flag is a big plus!",
  "Why did the bicycle fall over? Because it was two-tired!",
];

function getJokeHash(joke) {
  let hash = 0;
  for (let i = 0; i < joke.length; i++) {
    const char = joke.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return "joke_" + Math.abs(hash);
}

function getFeedbackForJoke(joke) {
  const jokeId = getJokeHash(joke);
  const stored = sharedStorage.getItem(jokeId);
  if (stored) {
    return JSON.parse(stored);
  }
  return { thumbsUp: 0, thumbsDown: 0 };
}

function saveFeedbackForJoke(joke, data) {
  const jokeId = getJokeHash(joke);
  sharedStorage.setItem(jokeId, JSON.stringify(data));
}

function getRandomJoke() {
  return jokes[Math.floor(Math.random() * jokes.length)];
}

function serveJoke(req) {
  try {
    const randomJoke = getRandomJoke();
    const jokeId = getJokeHash(randomJoke);
    const feedback = getFeedbackForJoke(randomJoke);

    const html =
      '<!DOCTYPE html><html><head><title>Joke</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}.joke-box{background:white;padding:40px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.2);max-width:600px;text-align:center}h1{color:#333;margin-bottom:20px}p{color:#666;font-size:18px;line-height:1.6}button{background:#667eea;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-top:20px;margin-right:10px;font-size:16px}button:hover{background:#764ba2}.feedback-container{margin-top:30px;padding-top:20px;border-top:2px solid #eee}.feedback-buttons{display:flex;justify-content:center;gap:10px;margin-top:15px}.feedback-btn{background:none;border:2px solid #667eea;color:#667eea;padding:10px 20px;border-radius:5px;cursor:pointer;font-size:18px;transition:all 0.3s}.feedback-btn:hover{background:#667eea;color:white}.feedback-stats{display:flex;justify-content:center;gap:30px;margin-top:15px;font-size:16px}.stat{display:flex;align-items:center;gap:8px}.stat-label{color:#333;font-weight:bold}</style></head><body><div class="joke-box"><h1>😂 Today\'s Joke</h1><p>' +
      randomJoke +
      '</p><button onclick="location.reload()">Tell me another!</button><div class="feedback-container"><div style="color:#999;font-size:14px;margin-bottom:10px;">Did you like this joke?</div><div class="feedback-buttons"><button class="feedback-btn" onclick="submitFeedback(\'up\',\'' +
      jokeId +
      "')\">👍</button><button class=\"feedback-btn\" onclick=\"submitFeedback('down','" +
      jokeId +
      '\')">👎</button></div><div class="feedback-stats"><div class="stat"><span>👍</span><span class="stat-label" id="upCount">' +
      feedback.thumbsUp +
      '</span></div><div class="stat"><span>👎</span><span class="stat-label" id="downCount">' +
      feedback.thumbsDown +
      "</span></div></div></div></body><script>function submitFeedback(type,jokeId){fetch('/joke/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,jokeId:jokeId})}).then(r=>r.json()).then(data=>{document.getElementById('upCount').textContent=data.thumbsUp;document.getElementById('downCount').textContent=data.thumbsDown}).catch(e=>console.error('Error:',e))}</script></html>";

    return {
      status: 200,
      body: html,
      contentType: "text/html; charset=UTF-8",
    };
  } catch (error) {
    console.log("Error in serveJoke: " + error);
    return {
      status: 500,
      body: "Internal error",
      contentType: "text/plain",
    };
  }
}

function handleFeedback(req) {
  try {
    if (req.method === "POST") {
      let feedbackType = "up";
      let jokeId = null;

      if (req.body) {
        const data = JSON.parse(req.body);
        feedbackType = data.type || "up";
        jokeId = data.jokeId;
      }

      if (!jokeId) {
        return {
          status: 400,
          body: JSON.stringify({ error: "Missing jokeId" }),
          contentType: "application/json",
        };
      }

      const feedbackData = JSON.parse(
        sharedStorage.getItem(jokeId) || '{"thumbsUp":0,"thumbsDown":0}',
      );

      if (feedbackType === "up") {
        feedbackData.thumbsUp += 1;
      } else if (feedbackType === "down") {
        feedbackData.thumbsDown += 1;
      }

      sharedStorage.setItem(jokeId, JSON.stringify(feedbackData));
      console.log(
        "Feedback recorded for joke " +
          jokeId +
          " - Up: " +
          feedbackData.thumbsUp +
          ", Down: " +
          feedbackData.thumbsDown,
      );

      return {
        status: 200,
        body: JSON.stringify(feedbackData),
        contentType: "application/json",
      };
    } else if (req.method === "GET") {
      return {
        status: 400,
        body: JSON.stringify({
          error: "GET not supported for feedback endpoint",
        }),
        contentType: "application/json",
      };
    }

    return {
      status: 400,
      body: JSON.stringify({ error: "Invalid request method" }),
      contentType: "application/json",
    };
  } catch (error) {
    console.log("Error in handleFeedback: " + error);
    return {
      status: 500,
      body: JSON.stringify({ error: "Internal error" }),
      contentType: "application/json",
    };
  }
}

function resolveGetJoke(args) {
  try {
    const joke = getRandomJoke();
    const feedback = getFeedbackForJoke(joke);
    return {
      success: true,
      joke: joke,
      thumbsUp: feedback.thumbsUp,
      thumbsDown: feedback.thumbsDown,
    };
  } catch (error) {
    console.log("Error in resolveGetJoke: " + error);
    return {
      success: false,
      joke: null,
      error: "Failed to retrieve joke",
    };
  }
}

function init() {
  console.log("Initializing joke page script");
  routeRegistry.registerRoute("/joke", "serveJoke", "GET");
  routeRegistry.registerRoute("/joke/feedback", "handleFeedback", "POST");
  graphQLRegistry.registerQuery(
    "getJoke",
    "type Query { getJoke: JokeResult! } type JokeResult { success: Boolean! joke: String! thumbsUp: Int! thumbsDown: Int! error: String }",
    "resolveGetJoke",
    "external",
  );
}
