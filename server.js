// Base Websocket name for our groups
const SOCKET_GROUP = 'watcher_';

// Set a default Momentum goal amount, could be 0
const DEFAULT_GOAL = 10;

// Setup a good generator for our session IDs
// Skip npm and dependencies and just copy the single magic line from https://www.npmjs.com/package/nanoid
// Note instead of a custom library we just drop - and _ as options and use "Z" in that case instead
const nanoid=(t=21)=>crypto.getRandomValues(new Uint8Array(t)).reduce(((t,e)=>t+=(e&=63)<36?e.toString(36):e<62?(e-26).toString(36).toUpperCase():"Z"),"");

const sessions = {
  // Will have the format of a generated Session ID, with these properties:
  //   sessionId: { playerMomentum, playerGoal, opponentMomentum, opponentGoal }
};

const DEFAULT_HOSTNAME = Bun.env.isProduction ? 'https://distant-adventures-app.onrender.com' : 'localhost';
const DEFAULT_PORT = 3000;

log("Environment (isProduction=" + Bun.env.isProduction + ") and host/port: " + DEFAULT_HOSTNAME + " (" + DEFAULT_PORT + ")");

const server = Bun.serve({
  port: DEFAULT_PORT,
  async fetch(req, server) {
    // Determine if we have an existing session
    const { searchParams } = new URL(req.url);
    let sessionId = null;
    if (searchParams && searchParams.get("id")) {
      if (sessions[searchParams.get("id")]) {
        sessionId = searchParams.get("id");
        log("Existing sessionId=" + sessionId);
      }
      // If we don't have a match, maybe the user is refreshing a stale or bookmarked URL
      // So let's give them the benefit of the doubt and try to create their session with the desired ID
      else {
        sessionId = makeNewSession(searchParams.get("id"));
      }
    }
    
    // Create a new session
    if (!sessionId) {
      sessionId = makeNewSession();
    }
    
    // Handle our incoming request depending on the path
    switch (new URL(req.url).pathname) {
      case '/':
        // Read our HTML page file
        let toReturn = await Bun.file('./main.html').text();
        
        // Log how many sessions we have currently
        // TODO Clean up sessions based on WS status? Or time/expiry? Could track a "last active" flag? Or after a certain cap? Or a combination of all of those?
        log("Session count " + Object.keys(sessions).length);
        
        // Replace our various data points in the page with our current session data
        toReturn = toReturn.replaceAll('"${HOSTNAME}"', '"' + DEFAULT_HOSTNAME + '"');
        toReturn = toReturn.replaceAll('"${PORT}"', '"' + DEFAULT_PORT + '"');
        toReturn = toReturn.replaceAll('"${SESSION_ID}"', '"' + sessionId + '"');
        toReturn = toReturn.replaceAll('${PLAYER_GOAL}', sessions[sessionId].playerGoal);
        toReturn = toReturn.replaceAll('${PLAYER_MOMENTUM}', sessions[sessionId].playerMomentum);
        toReturn = toReturn.replaceAll('${OPPONENT_GOAL}', sessions[sessionId].opponentGoal);
        toReturn = toReturn.replaceAll('${OPPONENT_MOMENTUM}', sessions[sessionId].opponentMomentum);
        
        return new Response(toReturn, { headers: { 'Content-Length': toReturn.length, 'Content-Type': 'text/html;charset=utf-8' }});
      case '/ws':
        log("Start WS", req.url);
        
        if (server.upgrade(req)) {
          return; // Return nothing if successful
        }
        return new Response("Websocket upgrade failed", { status: 500 });
      case '/momentum':
        return handleMomentumPost(req);
      case '/goal':
        return handleGoalPost(req);
      case '/state':
        return handleStateGet(req);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
  // TODO Determine how long Websockets stay open, and if we need to refresh/reconnect them. Also whether mobile needs a resume/reconnect?
  websocket: {
    message(ws, content) {
      if (content) {
        try{
          const parsedContent = JSON.parse(content);
          if (parsedContent.sessionId && parsedContent.type) {
            if (parsedContent.type === 'subscribe') {
              ws.subscribe(SOCKET_GROUP + parsedContent.sessionId);
            }
            else if (parsedContent.type === 'unsubscribe') {
              ws.unsubscribe(SOCKET_GROUP + parsedContent.sessionId);
            }
          }
        }catch (ignored) { }
      }
    },
    // Don't do anything with open/close/drain, so leave undeclared
  },
});

async function handleMomentumPost(req) {
  try{
    const body = await req.json();
    log("Momentum POST in", body);
    
    // Determine if we have a valid Session ID to work with
    const currentSessionId = body.sessionId;
    if (!currentSessionId) {
      return new Response("Session ID is required", { status: 400 });
    }
    const currentSession = sessions[currentSessionId];
    if (!currentSession) {
      return new Response("No Session was found", { status: 400 });
    }
    
    // Set our other flags: isPlayer, isSet, and momentum
    let isPlayer = body.isPlayer ? true : false;
    let isSet = body.isSet ? true : false;
    let momentum = 0;
    if (typeof body.momentum === 'number') {
      momentum = body.momentum;
    }
    
    log("Momentum POST params sessionId=" + currentSessionId + " isPlayer=" + isPlayer + " isSet=" + isSet + " momentum=" + momentum);
    
    // We're either setting the Momentum or just add/subtract based on the current
    if (isSet) {
      if (isPlayer) {
        currentSession.playerMomentum = momentum;
      }
      else {
        currentSession.opponentMomentum = momentum;
      }
    }
    else {
      if (isPlayer) {
        currentSession.playerMomentum += momentum;
      }
      else {
        currentSession.opponentMomentum += momentum;
      }
    }
    
    // Minimum the Momentum
    if (currentSession.playerMomentum < 0) { currentSession.playerMomentum = 0; }
    if (currentSession.opponentMomentum < 0) { currentSession.opponentMomentum = 0; }
    
    const toSend = {
      isPlayer: isPlayer,
      newMomentum: isPlayer ? currentSession.playerMomentum : currentSession.opponentMomentum
    };
    
    log("Momentum POST out", toSend);
    
    server.publish(SOCKET_GROUP + currentSessionId, JSON.stringify(toSend));
    return new Response(toSend);
  }catch (err) {
    log("Momentum POST failed", err);
  }
  return new Response(JSON.stringify({}), { status: 500 });
}

async function handleGoalPost(req) {
  try{
    const body = await req.json();
    log("Goal POST in", body);
    
    // Determine if we have a valid Session ID to work with
    const currentSessionId = body.sessionId;
    if (!currentSessionId) {
      return new Response("Session ID is required", { status: 400 });
    }
    const currentSession = sessions[currentSessionId];
    if (!currentSession) {
      return new Response("No Session was found", { status: 400 });
    }
    
    // Set our other flags: isPlayer and goal
    let isPlayer = body.isPlayer ? true : false;
    let goal = 0;
    if (typeof body.goal === 'number') {
      goal = body.goal;
    }
    
    // Minimum the goal
    if (goal < 0) { goal = 0; }
    
    log("Goal POST params", currentSessionId, isPlayer, goal);
    
    if (isPlayer) {
      currentSession.playerGoal = goal;
    }
    else {
      currentSession.opponentGoal = goal;
    }
    
    const toSend = {
      isPlayer: isPlayer,
      newGoal: isPlayer ? currentSession.playerGoal : currentSession.opponentGoal
    };
    
    log("Goal POST out", toSend);
    
    server.publish(SOCKET_GROUP + currentSessionId, JSON.stringify(toSend));
    return new Response(toSend);
  }catch (err) {
    log("Goal POST failed", err);
  }
  return new Response(JSON.stringify({}), { status: 500 });
}

async function handleStateGet(req) {
  try{
    let workingSession = sessions[sessionId];
    if (workingSession) {
      return new Response(JSON.stringify({
        playerGoal: workingSession.playerGoal,
        playerMomentum: workingSession.playerMomentum,
        opponentGoal: workingSession.opponentGoal,
        opponentMomentum: workingSession.opponentMomentum
      }), { status: 200 });
    }
  }catch (err) {
    log("State GET failed", err);
  }
  return new Response(JSON.stringify({}), { status: 404 });
}

function makeNewSession(sessionId) {
  if (!sessionId) {
    sessionId = generateSessionId();
    log("Make new sessionId=" + sessionId);
  }
  else {
    log("Request non-existent, regenerating for sessionId=" + sessionId);
  }
  sessions[sessionId] = {
    playerMomentum: 0,
    playerGoal: DEFAULT_GOAL,
    opponentMomentum: 0,
    opponentGoal: DEFAULT_GOAL
  }
  return sessionId;
}

function generateSessionId(tryAttempt) {
  // Note uppercasing makes the session way easier to convey to friends, even if we marginally increase our collision odds after a million sessions
  const newId = nanoid(4).toUpperCase();
  
  // For collision matching we're waaaay overdoing it, as just a single regenerate will cover us for 100k+ sessions
  // Which would be amazing if the game and app got that popular, haha
  // But either way, may as well do it right, up to a cap of retries. Should be good for a million sessions or so
  if (sessions[newId]) {
    if (typeof tryAttempt !== 'number') {
      tryAttempt = 0;
    }
    else if (tryAttempt > 100) {
      log("Even after 100 tries of regenerating, we made a duplicate session ID. Current session count is " + Object.keys(sessions).length);
      // In this super duper rare case, just throw in another digit
      return nanoid(5).toUpperCase();
    }
    tryAttempt++;
    return generateSessionId(tryAttempt);
  }
  
  return newId;
}

function log(message, ...extra) {
  console.log(new Date().toLocaleString() + " - " + message, extra && extra.length > 0 ? extra : '');
}

log("Bun: Hit me with some Momentum!\n");
