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

var players = {};

var gameState = {
    targets:0,
    turn: 0,
};

let turnQueue = [];

wss.on('connection', async function connection(ws) {
    const broadcast = (msg, antiTarget = null) => {
        for (let client in players) {
            let player = players[client];
            if((antiTarget && client !== antiTarget) || !antiTarget){
                player.ws.send(JSON.stringify(msg));
            }
        }
    }

    const handleDisconnect = async () => {
        handleClearTurns();
        for (let client in players) {
            let player = players[client];
            if(player.ws.readyState !== WebSocket.OPEN){
                delete players[client];
            }
        }
    }

    const handleClearTurns = () => {
        turnQueue.forEach(id => {
            clearTimeout(id);
        });
    };

    const handleGameStart = () => {
        let startingPlayer = Math.floor(Math.random() * 2) + 1;

        gameState.turn = startingPlayer;
        broadcast({action: 'GameStart', gameState: {...gameState, playerStatus: 'Starting...', opponentStatus: 'Starting...',}});

        handleCycleTurn(Object.keys(players)[startingPlayer - 1]);
    }

    const handlePlaceShip = (res, ws) => {
        if(gameState.turn !== 0){
            ws.send(JSON.stringify({action: 'PlaceShip', result: false, message: `Turn is not 0 it is ${gameState.turn} so placement not allowed`}))
        }
        else{
            players[res.clientID] = {
                ...players[res.clientID], 
                board: res.board, 
                rawShips: {...players[res.clientID].rawShips, [res.shipData.id]: res.shipData.length}, 
                placedShips: players[res.clientID].placedShips.concat(res.shipData)};
            gameState.targets = Math.max(gameState.targets, Object.values(players[res.clientID].rawShips).reduce((acc, value) => acc + value, 0));
            ws.send(JSON.stringify({action: 'PlaceShip', result: true, board: players[res.clientID].board, placedShips: players[res.clientID].placedShips, gameState}));
            broadcast({action: 'OpponentPlaceShip', opponentShips: players[res.clientID].placedShips, opponentShipsRaw: players[res.clientID].rawShips, gameState}, res.clientID)
        }
    }

    const handleShot = (i, j, clientID) => {
        let currentPlayers = Object.keys(players);
        let opponentID = players[clientID].turnID === 1 ? currentPlayers[1] : currentPlayers[0];

        let board = players[opponentID].board; // looking at opponent board
        let cellData = {cellState: board[i][j].cellState, shipID: board[i][j].shipID, shipPart: board[i][j].shipPart, direction: board[i][j].direction};;

        let message = {};
        let shipHit;

        let action = () => {};
        
        if(gameState.turn !== players[clientID].turnID){
            players[clientID].ws.send(JSON.stringify({action: 'NotTurn'}));
            return;
        }

        if(cellData.cellState == 0){
            cellData.cellState = -1; // miss
            message.action = 'Miss'
            players[clientID].miss ++;
            action = () => {handleCycleTurn(opponentID); };
        }
        else if(cellData.cellState > 0){
            cellData.cellState = -2; // hit
            message.action = 'Hit';

            shipHit = handleShipHit(cellData.shipID, opponentID)
            if(shipHit.result){
                message.shotAction = shipHit.shotAction;
                message.shipName = shipHit.shipName;
                message.rawShips = shipHit.rawShips;
            }

            players[clientID].hit ++;

            if(players[clientID].hit === gameState.targets) action = () => {handleWin(clientID);};
            else action = () => {handleCycleTurn(clientID); };
        }
        else{ // player hits same place again
            message.action = 'InvalidShot'
            action = () => {handleCycleTurn(clientID); };
        }

        board[i][j] = cellData;
        players[opponentID].board = board;

        gameState.turn = 4;

        players[clientID].ws.send(JSON.stringify({...message, 
            opponent: false, 
            i,
            j,
            cellData: {cellState: cellData.cellState},
            playerScore: players[clientID].hit,
            playerMisses: players[clientID].miss,
            gameState: {...gameState, 
                playerStatus: 'Waiting...',
                opponentStatus: 'Waiting...'
            }
        }));

        players[opponentID].ws.send(JSON.stringify({...message, 
            opponent: true, 
            board: players[opponentID].board,
            opponentScore: players[clientID].hit, 
            opponentMisses: players[clientID].miss,
            gameState: {...gameState, 
                playerStatus: 'Waiting...',
                opponentStatus: 'Waiting...'
            }
        }));

        action();
    }

    const handleCycleTurn = (clientID, time = 1500) => {
        turnQueue.push(setTimeout(() => {
            gameState.turn = players[clientID].turnID;
            players[clientID].ws.send(JSON.stringify({action: 'CycleTurn', gameState: {...gameState, playerStatus: 'Thinking...', opponentStatus: 'Waiting'}}))
            broadcast({action: 'CycleTurn', gameState: {...gameState, opponentStatus: 'Thinking...', playerStatus: 'Waiting'}}, clientID)
        }, time));
    }

    const handleShipHit = (id, opponentID) => {
        var ship;
        var shipHit = {result: false, shotAction: 'Ship', shipName: '', rawShips: players[opponentID].rawShips}
        if(ship = players[opponentID].placedShips.find(ship => ship.id === id)){
            shipHit.result = true;
            ship.health -= 1;
            shipHit.shipName = ship.name;

            players[opponentID].rawShips[ship.id]--;
            shipHit.rawShips = players[opponentID].rawShips;

            if(ship.health == 0){ // killed ship
                shipHit.shotAction = 'Sunk'
            }
            else if(ship.health == ship.length - 1){ // found ship
                shipHit.shotAction = 'Found'
            }
        }
        return shipHit;
    }

    const handleWin = (clientID) => {
        gameState = {...gameState, turn: -1};

        players[clientID].ws.send(JSON.stringify({
            action: 'Win', 
            gameState: {...gameState, 
                playerStatus: 'Happy',
                opponentStatus: 'Downhearted'}}));

        broadcast({
            action: 'Lose', 
            gameState: {...gameState, 
                playerStatus: 'Sad',
                opponentStatus: 'Content'}}, clientID);
    }

    ws.on('message', (message) => {
        try {
            const res = JSON.parse(message);
            let currentPlayers = Object.keys(players);
            switch (res.action) {
                case 'Join':
                    if(currentPlayers.length < 2){
                        const clientID = uuidv4();
                        players[clientID] = {
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

                        ws.send(JSON.stringify({action: 'Init', gameState: {...gameState, playerStatus: 'Staging...', opponentStatus: 'Staging...',}, clientID: clientID, turnID: players[clientID].turnID}));
                        broadcast({action: 'PlayerJoin', message: 'New player ' + res.username, playerName: res.username}, clientID);
                        if(currentPlayers.length === 1){
                            ws.send(JSON.stringify({action: 'PlayerJoin', message: 'First player ' + players[currentPlayers[0]].username, playerName: players[currentPlayers[0]].username}));
                        }
                    }
                    else ws.send(JSON.stringify({action: 'GameFull'}));
                    
                    break;
                case 'Reset':
                    players[res.clientID] = {...players[res.clientID], board: res.board, placedShips: res.placedShips, rawShips: {}, ready: false};
                    break;
                case 'Ready':
                    players[res.clientID] = {...players[res.clientID], ready: true};

                    broadcast({action: 'Ready', gameState: {...gameState, opponentStatus: 'Ready'}, }, res.clientID);
                    ws.send(JSON.stringify({action: 'Ready', gameState: {...gameState, playerStatus: 'Ready'}}))
                    if (currentPlayers.length == 2 && players[currentPlayers[0]].ready && players[currentPlayers[1]].ready) {
                        handleGameStart();
                    }
                    break;
                case 'UnReady':
                    players[res.clientID] = {...players[res.clientID], ready: false};
                    broadcast({action: 'UnReady', gameState: {...gameState, opponentStatus: 'Staging...'}, }, res.clientID);
                    ws.send(JSON.stringify({action: 'UnReady', gameState: {...gameState, playerStatus: 'Staging...'}}))
                    break;
                case 'PlaceShip':
                    handlePlaceShip(res, ws);
                    break;
                case 'Shot':
                    handleShot(res.i, res.j, res.clientID)
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
        gameState = {
            targets:0,
            turn: 0
        };
        console.log('User disconnected');
        await handleDisconnect();
        
        if(Object.keys(players).length === 1){
            broadcast({action: 'PlayerLeave'});
            broadcast({action: 'StateChange', gameState: {...gameState, playerStatus: 'Staging...', opponentStatus: 'Staging...',}});
        }
    });
});




app.use(express.static('public'));

const port = 5500;
bin.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
