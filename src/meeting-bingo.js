/// <reference path="../types/aiwebengine.d.ts" />

// Meeting Bingo Game
// Interactive 4x4 bingo card for meetings

const bingoItems = [
  'Someone says "synergy"',
  'PowerPoint fails',
  'Someone joins late',
  'Unmute yourself',
  'Background blur activated',
  'Meeting could be an email',
  'Someone forgets to mute',
  'AI mentioned',
  'Budget cuts discussed',
  'Action items assigned',
  'Call dropped',
  'Awkward silence',
  'Someone says "circle back"',
  'Camera off the whole time',
  'Talking over each other',
  'FREE SPACE'
];

function getBingoPage(context) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Bingo</title>
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
      padding: 30px;
      max-width: 600px;
      width: 100%;
    }

    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 10px;
      font-size: 2.5em;
    }

    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 30px;
      font-size: 1.1em;
    }

    .bingo-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .bingo-square {
      aspect-ratio: 1;
      background: #f0f0f0;
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 0.85em;
      font-weight: 500;
      color: #333;
      transition: all 0.3s ease;
      user-select: none;
    }

    .bingo-square:hover:not(.marked) {
      background: #e8e8e8;
      border-color: #999;
      transform: scale(1.05);
    }

    .bingo-square.marked {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-color: #667eea;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .bingo-square.free {
      font-size: 0.9em;
      color: #999;
    }

    .controls {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    button {
      padding: 12px 24px;
      font-size: 1em;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s ease;
    }

    .reset-btn {
      background: #667eea;
      color: white;
    }

    .reset-btn:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .shuffle-btn {
      background: #764ba2;
      color: white;
    }

    .shuffle-btn:hover {
      background: #653a87;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(118, 75, 162, 0.4);
    }

    .bingo-status {
      text-align: center;
      margin-top: 20px;
      font-size: 1.1em;
      font-weight: 600;
      color: #667eea;
      min-height: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Meeting Bingo</h1>
    <p class="subtitle">Mark off squares as they happen!</p>
    
    <div class="bingo-grid" id="bingoGrid"></div>
    
    <div class="bingo-status" id="bingoStatus"></div>
    
    <div class="controls">
      <button class="shuffle-btn" onclick="shuffleCard()">🔀 New Card</button>
      <button class="reset-btn" onclick="resetCard()">↺ Reset</button>
    </div>
  </div>

  <script>
    const bingoItems = [
      'Someone says "synergy"',
      'PowerPoint fails',
      'Someone joins late',
      'Unmute yourself',
      'Background blur activated',
      'Meeting could be an email',
      'Someone forgets to mute',
      'AI mentioned',
      'Budget cuts discussed',
      'Action items assigned',
      'Call dropped',
      'Awkward silence',
      'Someone says "circle back"',
      'Camera off the whole time',
      'Talking over each other',
      'FREE SPACE'
    ];

    let currentCard = [];
    let markedSquares = new Set();

    function shuffleArray(array) {
      const shuffled = [...array].sort(() => Math.random() - 0.5);
      return shuffled;
    }

    function createCard() {
      currentCard = shuffleArray(bingoItems);
      markedSquares.clear();
      renderGrid();
    }

    function renderGrid() {
      const grid = document.getElementById('bingoGrid');
      grid.innerHTML = '';

      currentCard.forEach((item, index) => {
        const square = document.createElement('div');
        square.className = 'bingo-square';
        if (item === 'FREE SPACE') square.classList.add('free');
        if (markedSquares.has(index)) square.classList.add('marked');
        square.textContent = item;
        square.onclick = () => toggleSquare(index);
        grid.appendChild(square);
      });

      checkWin();
    }

    function toggleSquare(index) {
      if (currentCard[index] === 'FREE SPACE') {
        markedSquares.add(index);
      } else if (markedSquares.has(index)) {
        markedSquares.delete(index);
      } else {
        markedSquares.add(index);
      }
      renderGrid();
    }

    function checkWin() {
      const marked = Array.from(markedSquares);
      const status = document.getElementById('bingoStatus');

      // Check rows
      for (let i = 0; i < 4; i++) {
        const row = [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3];
        if (row.every(idx => markedSquares.has(idx))) {
          status.textContent = '🎉 BINGO! Row!';
          return;
        }
      }

      // Check columns
      for (let i = 0; i < 4; i++) {
        const col = [i, i + 4, i + 8, i + 12];
        if (col.every(idx => markedSquares.has(idx))) {
          status.textContent = '🎉 BINGO! Column!';
          return;
        }
      }

      // Check diagonals
      const diag1 = [0, 5, 10, 15];
      const diag2 = [3, 6, 9, 12];
      if (diag1.every(idx => markedSquares.has(idx))) {
        status.textContent = '🎉 BINGO! Diagonal!';
        return;
      }
      if (diag2.every(idx => markedSquares.has(idx))) {
        status.textContent = '🎉 BINGO! Diagonal!';
        return;
      }

      status.textContent = '';
    }

    function resetCard() {
      markedSquares.clear();
      renderGrid();
    }

    function shuffleCard() {
      createCard();
    }

    // Initialize on page load
    createCard();
  </script>
</body>
</html>
  `;
  return ResponseBuilder.html(html);
}

function init(context) {
  routeRegistry.registerRoute('/bingo', 'getBingoPage', 'GET');
  return { success: true };
}