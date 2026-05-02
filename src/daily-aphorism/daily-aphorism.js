/// <reference path="../../types/aiwebengine.d.ts" />

// Daily Aphorism Page
// Displays a unique aphorism for each day

const aphorisms = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Innovation distinguishes between a leader and a follower. - Steve Jobs",
  "Life is what happens when you're busy making other plans. - John Lennon",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "It is during our darkest moments that we must focus to see the light. - Aristotle",
  "The only impossible journey is the one you never begin. - Tony Robbins",
  "Success is not final, failure is not fatal. - Winston Churchill",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "The best time to plant a tree was 20 years ago. The second best time is now. - Chinese Proverb",
  "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
  "The only limit to our realization of tomorrow is our doubts of today. - Franklin D. Roosevelt",
  "Do what you can, with what you have, where you are. - Theodore Roosevelt",
  "Everything you want is on the other side of fear. - Jack Canfield",
  "Believe in yourself. You are braver than you think, more talented than you know, and capable of more than you imagine. - Roy T. Bennett",
  "I learned that courage was not the absence of fear, but the triumph over it. - Nelson Mandela",
];

function getDailyAphorism(context) {
  try {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const aphorismIndex = dayOfYear % aphorisms.length;
    const todayAphorism = aphorisms[aphorismIndex];
    const formattedDate = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Aphorism</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          
          .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 60px 40px;
            max-width: 600px;
            text-align: center;
            animation: fadeIn 0.6s ease-in;
          }
          
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .date {
            color: #667eea;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 30px;
          }
          
          .aphorism {
            font-size: 28px;
            line-height: 1.6;
            color: #333;
            margin-bottom: 30px;
            font-style: italic;
            font-weight: 300;
          }
          
          .quote-mark {
            font-size: 60px;
            color: #667eea;
            opacity: 0.2;
            line-height: 1;
            margin-bottom: 20px;
          }
          
          .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            font-size: 14px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 20px;
          }
          
          .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
          }
          
          .refresh-btn:active {
            transform: translateY(0);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="date">${formattedDate}</div>
          <div class="quote-mark">"</div>
          <div class="aphorism">${todayAphorism}</div>
          <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>
      </body>
      </html>
    `;

    return ResponseBuilder.html(html);
  } catch (error) {
    console.error("Error: " + error);
    return ResponseBuilder.error(500, "Failed to generate aphorism");
  }
}

function init() {
  console.log("Initializing daily aphorism page");
  routeRegistry.registerRoute("/aphorism", "getDailyAphorism", "GET");
}
