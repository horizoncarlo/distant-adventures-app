# Distant Adventures - Momentum Tracker
Distant Adventures is a lightweight roleplaying game for any setting or theme, with flexible character creation, and conflict resolution based around gaining group Momentum. The ability for players to equally contribute to the story how they want in a meaningful, impactful way by growing their group’s Momentum is a key part of the game.

This application can be used when running a remote / webcam / Discord session to allow every involved player to easily see the current state of Momentum.

Each player should join the same session/room, which is noted by a randomly generated 4-digit code (or a custom one can be set). Anyone in the same session can see and modify the Momentum.

For more information on the game see https://horizongamesblog.wordpress.com/distant-adventures/

### Live Demo
To see the application running visit https://distant-adventures-app.onrender.com/ or http://adventure.homelinux.com/

### Setup and Running
For simplicity the app uses Bun and serves plain HTML/JS/CSS with no dependencies. Websockets are used under the hood for pushing state between interested players.

See "bun run" for a list of options.
