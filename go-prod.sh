#!/bin/bash
#screen -d -m -S distantadventures sh -c "isProduction=true bun run start"
#screen -r
isProduction=true pm2 start bun --name "distantadventures" -- run start
