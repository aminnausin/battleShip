const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require("uuid");

const app = express();
const bin = http.createServer(app);
const wss = new WebSocket.Server({ server: bin });

const shipPool = [
    {id: 0, name: 'carrier', length:5, direction: [0,1]},
    {id: 1, name: 'destroyer', length:4, direction: [0,1]},
    {id: 2, name: 'submarine', length:3, direction: [0,1]},
    {id: 3, name: 'submarine', length:3, direction: [0,1]},
    {id: 4, name: 'scout', length:2, direction: [0,1]},
    {id: 5, name: 'scout', length:2, direction: [0,1]}
];

var rooms = {};

var allPlayers = {};

wss.on('connection', async function connection(ws) {
    const broadcast = (msg, roomCode, antiTarget = null) => {
        for (let client in rooms[roomCode].players) {
            let player = rooms[roomCode].players[client];
            if((antiTarget && client !== antiTarget) || !antiTarget){
                player.ws.send(JSON.stringify(msg));
            }
        }
    }

    const handleDisconnect = async () => {
        for (let client in allPlayers) { // For every player uuid
            let player = allPlayers[client]; // get player data for uuid
            if(player.ws.readyState !== WebSocket.OPEN){
                let roomCode = player.roomCode;
                handleClearTurns(roomCode);
                delete rooms[roomCode].players[client];
                delete allPlayers[client];

                rooms[roomCode].gameState = {
                    targets:0,
                    turn: 0
                };
                
                if(Object.keys(rooms[roomCode].players).length === 1){
                    broadcast({action: 'PlayerLeave'}, roomCode);
                    broadcast({action: 'StateChange', gameState: {...rooms[roomCode].gameState, playerStatus: 'Staging...', opponentStatus: 'Staging...',}}, roomCode);
                }
                else if(Object.keys(rooms[roomCode].players).length === 1){
                    delete rooms[roomCode];
                }
            }
        }
    }

    const handleClearTurns = (roomCode) => {
        rooms[roomCode].turnQueue.forEach(id => {
            clearTimeout(id);
        });
    };

    const handleGameStart = (roomCode) => {
        let startingPlayer = Math.floor(Math.random() * 2) + 1;

        rooms[roomCode].gameState.turn = startingPlayer;
        broadcast({action: 'GameStart', gameState: {...rooms[roomCode].gameState, playerStatus: 'Starting...', opponentStatus: 'Starting...',}}, roomCode);

        handleCycleTurn(Object.keys(rooms[roomCode].players)[startingPlayer - 1], roomCode);
    }

    const handlePlaceShip = (res, ws, roomCode) => {
        if(rooms[roomCode].gameState.turn !== 0){
            ws.send(JSON.stringify({action: 'PlaceShip', result: false, message: `Turn is not 0 it is ${rooms[roomCode].gameState.turn} so placement not allowed`}))
        }
        else{
            rooms[roomCode].players[res.clientID] = {
                ...rooms[roomCode].players[res.clientID], 
                board: res.board, 
                rawShips: {...rooms[roomCode].players[res.clientID].rawShips, [res.shipData.id]: res.shipData.length}, 
                placedShips: rooms[roomCode].players[res.clientID].placedShips.concat(res.shipData)};
            rooms[roomCode].gameState = {
                ...rooms[roomCode].gameState,
                targets: Math.max(rooms[roomCode].gameState.targets, Object.values(rooms[roomCode].players[res.clientID].rawShips).reduce((acc, value) => acc + value, 0))
            }

            ws.send(JSON.stringify({action: 'PlaceShip', result: true, board: rooms[roomCode].players[res.clientID].board, placedShips: rooms[roomCode].players[res.clientID].placedShips, gameState:{...rooms[roomCode].gameState}}));
            broadcast({action: 'OpponentPlaceShip', opponentShips: rooms[roomCode].players[res.clientID].placedShips, opponentShipsRaw: rooms[roomCode].players[res.clientID].rawShips, gameState:{...rooms[roomCode].gameState}}, roomCode, res.clientID)
        }
    }

    const handleShot = (i, j, clientID, roomCode) => {
        let currentPlayers = Object.keys(rooms[roomCode].players);
        let opponentID = rooms[roomCode].players[clientID].turnID === 1 ? currentPlayers[1] : currentPlayers[0];

        let board = rooms[roomCode].players[opponentID].board; // looking at opponent board
        let cellData = {cellState: board[i][j].cellState, shipID: board[i][j].shipID, shipPart: board[i][j].shipPart, direction: board[i][j].direction};;

        let message = {};
        let shipHit;

        let action = () => {};
        
        if(rooms[roomCode].gameState.turn !== rooms[roomCode].players[clientID].turnID){
            rooms[roomCode].players[clientID].ws.send(JSON.stringify({action: 'NotTurn'}));
            return;
        }

        if(cellData.cellState == 0){
            cellData.cellState = -1; // miss
            message.action = 'Miss'
            rooms[roomCode].players[clientID].miss ++;
            action = () => {handleCycleTurn(opponentID, roomCode); };
        }
        else if(cellData.cellState > 0){
            cellData.cellState = -2; // hit
            message.action = 'Hit';

            shipHit = handleShipHit(cellData.shipID, opponentID, roomCode)
            if(shipHit.result){
                message.shotAction = shipHit.shotAction;
                message.shipName = shipHit.shipName;
                message.rawShips = shipHit.rawShips;
            }

            rooms[roomCode].players[clientID].hit ++;

            if(rooms[roomCode].players[clientID].hit === rooms[roomCode].gameState.targets) action = () => {handleWin(clientID, roomCode);};
            else action = () => {handleCycleTurn(clientID, roomCode); };
        }
        else{ // player hits same place again
            message.action = 'InvalidShot'
            action = () => {handleCycleTurn(clientID, roomCode); };
        }

        board[i][j] = cellData;
        rooms[roomCode].players[opponentID].board = board;

        rooms[roomCode].gameState.turn = 4;

        rooms[roomCode].players[clientID].ws.send(JSON.stringify({...message, 
            opponent: false, 
            i,
            j,
            cellData: {cellState: cellData.cellState},
            playerScore: rooms[roomCode].players[clientID].hit,
            playerMisses: rooms[roomCode].players[clientID].miss,
            gameState: {...rooms[roomCode].gameState, 
                playerStatus: 'Waiting...',
                opponentStatus: 'Waiting...'
            }
        }));

        rooms[roomCode].players[opponentID].ws.send(JSON.stringify({...message, 
            opponent: true, 
            board: rooms[roomCode].players[opponentID].board,
            opponentScore: rooms[roomCode].players[clientID].hit, 
            opponentMisses: rooms[roomCode].players[clientID].miss,
            gameState: {...rooms[roomCode].gameState, 
                playerStatus: 'Waiting...',
                opponentStatus: 'Waiting...'
            }
        }));

        action();
    }

    const handleCycleTurn = (clientID, roomCode, time = 1500) => {
        rooms[roomCode].turnQueue.push(setTimeout(() => {
            rooms[roomCode].gameState.turn = rooms[roomCode].players[clientID].turnID;
            rooms[roomCode].players[clientID].ws.send(JSON.stringify({action: 'CycleTurn', gameState: {...rooms[roomCode].gameState, playerStatus: 'Thinking...', opponentStatus: 'Waiting'}}))
            broadcast({action: 'CycleTurn', gameState: {...rooms[roomCode].gameState, opponentStatus: 'Thinking...', playerStatus: 'Waiting'}}, roomCode, clientID)
        }, time));
    }

    const handleShipHit = (id, opponentID, roomCode) => {
        var ship;
        var shipHit = {result: false, shotAction: 'Ship', shipName: '', rawShips: rooms[roomCode].players[opponentID].rawShips}
        if(ship = rooms[roomCode].players[opponentID].placedShips.find(ship => ship.id === id)){
            shipHit.result = true;
            ship.health -= 1;
            shipHit.shipName = ship.name;

            rooms[roomCode].players[opponentID].rawShips[ship.id]--;
            shipHit.rawShips = rooms[roomCode].players[opponentID].rawShips;

            if(ship.health == 0){ // killed ship
                shipHit.shotAction = 'Sunk'
            }
            else if(ship.health == ship.length - 1){ // found ship
                shipHit.shotAction = 'Found'
            }
        }
        return shipHit;
    }

    const handleWin = (clientID, roomCode) => {
        rooms[roomCode].gameState = {...rooms[roomCode].gameState, turn: -1};

        rooms[roomCode].players[clientID].ws.send(JSON.stringify({
            action: 'Win', 
            gameState: {...rooms[roomCode].gameState, 
                playerStatus: 'Happy',
                opponentStatus: 'Downhearted'}}));

        broadcast({
            action: 'Lose', 
            gameState: {...rooms[roomCode].gameState, 
                playerStatus: 'Sad',
                opponentStatus: 'Content'}}, roomCode, clientID);
    }

    const createRoom = (roomCode) => {
        rooms[roomCode] = {players: {}, gameState: {targets:0, turn: 0}, turnQueue: []}
    }

    ws.on('message', (message) => {
        try {
            const res = JSON.parse(message);
            const roomCode = res.roomCode;
            if(!rooms[roomCode]){
                createRoom(roomCode);
                console.log("Message from server ", res);
                console.log('New Room ' + roomCode);
            }
            let currentPlayers = Object.keys(rooms[roomCode].players);
            switch (res.action) {
                case 'Join':
                    if(currentPlayers.length < 2){
                        const clientID = uuidv4();
                        allPlayers[clientID] = {roomCode, ws};
                        rooms[roomCode].players[clientID] = {
                            username: res?.username,
                            ws,
                            ready: false,
                            turnID: currentPlayers.length + 1,
                            board: [],
                            rawShips:{}, 
                            placedShips: [],
                            hit: 0,
                            miss: 0,
                            status: 'Staging...'
                        }
                        ws.send(JSON.stringify({action: 'Init', gameState: {...rooms[roomCode].gameState, playerStatus: 'Staging...', opponentStatus: 'Staging...',}, clientID: clientID, turnID: rooms[roomCode].players[clientID].turnID}));
                        broadcast({action: 'PlayerJoin', message: 'New player ' + res.username, playerName: res.username}, roomCode, clientID);
                        if(currentPlayers.length === 1){
                            ws.send(JSON.stringify({action: 'PlayerJoin', message: 'First player ' + rooms[roomCode].players[currentPlayers[0]].username, playerName: rooms[roomCode].players[currentPlayers[0]].username}));
                        }
                    }
                    else ws.send(JSON.stringify({action: 'GameFull'}));
                    
                    break;
                case 'Reset':
                    rooms[roomCode].players[res.clientID] = {...rooms[roomCode].players[res.clientID], board: res.board, placedShips: res.placedShips, rawShips: {}, ready: false};
                    break;
                case 'Ready':
                    rooms[roomCode].players[res.clientID] = {...rooms[roomCode].players[res.clientID], ready: true};

                    broadcast({action: 'Ready', gameState: {...rooms[roomCode].gameState, opponentStatus: 'Ready'}, }, roomCode, res.clientID);
                    ws.send(JSON.stringify({action: 'Ready', gameState: {...rooms[roomCode].gameState, playerStatus: 'Ready'}}))
                    if (currentPlayers.length == 2 && rooms[roomCode].players[currentPlayers[0]].ready && rooms[roomCode].players[currentPlayers[1]].ready) {
                        handleGameStart(roomCode);
                    }
                    break;
                case 'UnReady':
                    rooms[roomCode].players[res.clientID] = {...rooms[roomCode].players[res.clientID], ready: false};
                    broadcast({action: 'UnReady', gameState: {...rooms[roomCode].gameState, opponentStatus: 'Staging...'}, }, roomCode, res.clientID);
                    ws.send(JSON.stringify({action: 'UnReady', gameState: {...rooms[roomCode].gameState, playerStatus: 'Staging...'}}))
                    break;
                case 'PlaceShip':
                    handlePlaceShip(res, ws, roomCode);
                    break;
                case 'Shot':
                    handleShot(res.i, res.j, res.clientID, roomCode)
                    break;
                default:
                    console.log(res);

                    break;
            }
        } catch (error) {
            console.log(error);
        }
    });

  // Handle disconnection
    ws.on('close', async () => {
        console.log('User disconnected');
        await handleDisconnect();
    });
});

app.use(express.static('public'));

const port = 5500;
bin.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
