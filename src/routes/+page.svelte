<script lang="ts">
	import toast from 'svelte-french-toast';
    import {dndzone, TRIGGERS} from "svelte-dnd-action";
    import { onMount } from "svelte";
    import { flip } from "svelte/animate";
    import { Sound } from 'svelte-sound';
    import Cell from "../components/Cell.svelte";
    import NavButton from "../components/NavButton.svelte";
    
    const letters = ['','A','B','C','D','E','F','G','H','I','J'];
    const sounds = { 
        sound_action_negative: new Sound("assets/actionBad.mp3"), 
        sound_game_start: new Sound("assets/gameStart.mp3"), 
        sound_game_win: new Sound("assets/gameWin.mp3"), 
        sound_game_loss: new Sound("assets/jingle.mp3"), 
        sound_place_ship: new Sound("assets/placeShip.mp3"), 
        sound_player_turn: new Sound("/assets/playerTurn.mp3"), 
        sound_player_found: new Sound("/assets/playerFound.mp3"), 
        sound_player_hit: new Sound("/assets/playerHit.mp3"), 
        sound_player_miss: new Sound("/assets/opponentMiss.wav"), 
        sound_player_sunk: new Sound("/assets/playerSunk.mp3"), 
        sound_opponent_turn: new Sound("/assets/opponentTurn.mp3"), 
        sound_opponent_found: new Sound("/assets/opponentFound.mp3"), 
        sound_opponent_hit: new Sound("/assets/opponentHit.wav"), 
        sound_opponent_miss: new Sound("/assets/opponentMiss.wav"), 
        sound_opponent_sunk: new Sound("/assets/jingle.mp3") 
    };
    const shipPool = [
        {id: 0, name: 'carrier', length:5, direction: [0,1]},
        {id: 1, name: 'destroyer', length:4, direction: [0,1]},
        {id: 2, name: 'submarine', length:3, direction: [0,1]},
        {id: 3, name: 'submarine', length:3, direction: [0,1]},
        {id: 4, name: 'scout', length:2, direction: [0,1]},
        {id: 5, name: 'scout', length:2, direction: [0,1]}
    ];

    let ships = [...shipPool]; // Your unplaced ships
    let shipsShadow: { id: number; name: string; length: number; direction: number[]; }[] = []; // Ghost icons for placed ships

    let placedShips:{id:number; name:string; length:number; direction: number[]; health:number;}[] = []; // Placed ships on board
    let opponentShips:{id:number; name:string; length:number; direction: number[]; health:number;}[] = []; // Opponent placed ships on board

    let opponentShipsRaw:{[id:number]:number} = {}; // Opponent ship health

    var playerCells:{cellState:number, shipID:number, shipPart:number, direction:string}[][] = []; // Player board states
    var opponentCells:{cellState:number, shipID:number, shipPart:number, direction:string}[][] = []; // Opponent board states

    let dragDropLocation:number[] = [];
    let dragDropRotation:number[] = [0,1];

    // Local game states

    var gameState = { 
        playerStatus: 'Staging...',
        opponentStatus: 'Staging...',
        targets:0,
        turn: 0
    }; // Local copy of game state

    let username = 'Aminushki';
    let opponentName = ''
    let clientID = '';
    let turnID = -1;
    let ready = false;
    let roomCode = ''; // User-entered room code
    let playerScore = 0;
    let playerMisses = 0;
    let opponentScore = 0;
    let opponentMisses = 0;
    let ws: WebSocket;

    // On join room send username and room code
    function joinRoom() {
        if(ws) ws.close();
        ws = new WebSocket('ws://localhost:5500'); // WebSocket server URL

        ws.onopen = () => {
            ws.send(JSON.stringify({action: 'Join', roomCode, username})); // Join with username
        };

        ws.onmessage = (event) => {
            try {
                const res = JSON.parse(event.data);
                console.log('Received:', res);
                switch (res.action) {
                    case 'Init': // Get client ID and player number
                        gameState = res.gameState;
                        clientID = res.clientID;
                        turnID = res.turnID;
                        break;
                    case 'StateChange': // Update turn and status states
                        gameState = res.gameState;
                        break;
                    case 'GameStart': // Start game and play sound
                        gameState = res.gameState;
                        sounds.sound_game_start.play();
                        break;    
                    case 'CycleTurn': // Cycle player turn
                        gameState = res.gameState;
                        handleTurn(gameState.turn === turnID);
                        break;
                    case 'PlaceShip': // Handle response to placing a ship
                        if(res.result){
                            playerCells = res.board;
                            if(placedShips.length == 0) sounds.sound_place_ship.play();
                            placedShips = res.placedShips;
                            gameState = {...res.gameState, playerStatus: gameState.playerStatus, opponentStatus: gameState.opponentStatus,};
                        }
                        else{
                            sounds.sound_action_negative.play();

                            toast.error('Cannot place ship there!');

                            ships = [...shipsShadow];
                        }
                        break;
                    case 'OpponentPlaceShip': // Handle opponent placing a ship
                        opponentShips = res.opponentShips;
                        opponentShipsRaw = res.opponentShipsRaw;
                        gameState = {...res.gameState, playerStatus: gameState.playerStatus, opponentStatus: gameState.opponentStatus,};
                        break;
                    case 'GameFull': // Handle a full server
                        toast.error("The game is full already");
                        ws.close();
                        ws = undefined;
                        break;
                    case 'Ready': // Handle response to ready from either player or opponent
                        gameState = {...res.gameState, playerStatus: res.gameState.playerStatus ?? gameState.playerStatus, opponentStatus: res.gameState.opponentStatus ?? gameState.opponentStatus }
                        break;
                    case 'UnReady': // Handle response to unready from either player or opponent
                        gameState = {...res.gameState, playerStatus: res.gameState.playerStatus ?? gameState.playerStatus, opponentStatus: res.gameState.opponentStatus ?? gameState.opponentStatus }
                        break;
                    case 'PlayerJoin': // Handle other player join
                        opponentName = res.playerName;
                        break;
                    case 'PlayerLeave': // Handle other player leave
                        handleOpponentLeave();
                        break;
                    case 'NotTurn': // Handle response to turn if not current 
                        sounds.sound_action_negative.play();
                        toast.error("It is not your turn!")
                        break;
                    case 'Miss': // Handle turn resulting in miss by player or opponent
                        if(res.opponent){
                            sounds.sound_opponent_miss.play();
                            toast.error("Opponent missed.");
                            playerCells = res.board;
                            opponentMisses = res.opponentMisses;
                        } else {
                            sounds.sound_player_miss.play();
                            toast.error("You missed.");
                            let board = opponentCells;
                            board[res.i][res.j] = res.cellData;
                            opponentCells = board;
                            playerMisses = res.playerMisses;
                        }
                        break;
                    case 'Hit': // Handle turn resulting in hit by player or opponent
                        if(res.shotAction){
                            switch (res.shotAction) {
                                case 'Found':
                                    if(res.opponent){
                                        toast.error(`Opponent found your ${res.shipName}!`);
                                        sounds.sound_player_found.play();
                                    } else {
                                        toast.success(`Found an opponent ship!`);
                                        sounds.sound_opponent_found.play();
                                    }
                                    break;
                                case 'Sunk':
                                    if(res.opponent){
                                        toast.error(`Opponent sunk your ${res.shipName}!`);
                                        sounds.sound_player_sunk.play();
                                    } else {
                                        toast.success(`Sunk opponents ${res.shipName}!`);
                                        sounds.sound_opponent_sunk.play();
                                    }
                                    break;
                                default:
                                    console.log('base hit');
                                    
                                    if(res.opponent){
                                        toast.error("Opponent hit you.");
                                        sounds.sound_player_hit.play();
                                    } else {
                                        toast.success("You hit!");
                                        sounds.sound_opponent_hit.play();
                                    }
                                    break;
                            }

                            opponentShipsRaw = !res.opponent ? res.rawShips : opponentShipsRaw; // change opponent ship health if you shot
                        }
                        if(res.opponent){ 
                            playerCells = res.board;
                            opponentScore = res.opponentScore; 
                        }
                        else{ 
                            let board = opponentCells;
                            board[res.i][res.j] = res.cellData;
                            opponentCells = board;
                            playerScore = res.playerScore;
                        }
                        gameState = res.gameState;
                        break;
                    case 'InvalidShot': // Handle turn on a previously used cell
                        toast.error("You already shot here." , { duration: 4000 });
                        break;
                    case 'Win': // Handle player win
                        toast.success('You Win!');
                        sounds.sound_game_win.play();
                        gameState = res.gameState;
                        break;
                    case 'Lose': // Handle player loss
                        toast.error('Opponent Wins!');
                        sounds.sound_game_loss.play();
                        gameState = res.gameState;
                        break;
                    default:
                        break;
                }
            } catch (error) {
                console.log(error);
            }
        };
    }

    const handleInitBoards = (playerOnly = false) => { // Create default player and enemy board
        for (let i = 0; i < 11; i++) {
            playerCells[i] = new Array(11).fill({cellState: 0});
            if(!playerOnly) opponentCells[i] = new Array(11).fill({cellState: 0});
        }
    }

    const handleGameLeave = () => { // Reset local state on leave
        handleInitBoards();

        ships = shipPool;
        placedShips = [];
        opponentShips = [];

        playerScore = 0;
        playerMisses = 0;
        opponentScore = 0;
        opponentMisses = 0;

        ready = false
        turnID = -1;
        opponentName = '';
        clientID = '';
        ws.close();
        ws = undefined;
        toast.success('Left game!'); 
    }

    const handleGameReset = (fromOpponentLeave:boolean) => { // Reset ship placements 
        handleInitBoards(!fromOpponentLeave);

        ships = shipPool;
        placedShips = [];
        ready = false;

        ws.send(JSON.stringify({action: 'Reset', board: playerCells, placedShips, clientID, roomCode}))

        if(!fromOpponentLeave) {
            toast.success('Reset game!'); 
            sounds.sound_player_turn.play();
        }

    };

    const handleOpponentLeave = () => { // Reset state on opponent leave
        opponentName = '';
        opponentShips = [];
        opponentShipsRaw = {};
        playerScore = 0;
        playerMisses = 0;
        opponentScore = 0;
        opponentMisses = 0;

        toast.error('Opponent left game...');
        sounds.sound_game_loss.play();
        if(ready) handleGameReset(true);
    }

    const handleGameReady = async () => { // Send ready / unready messages
        if(!ws) return; 
        if (ready) {
            ready = false;
            ws.send(JSON.stringify({action: 'UnReady', clientID, roomCode}));
        }
        else{
            if(placedShips.length < 6) {
                toast.error("Place all ships to play!")
                sounds.sound_action_negative.play();
                return;
            }

            ws.send(JSON.stringify({action: 'Ready', clientID, roomCode}));
            ready = true;
        }
    };

    const handleTurn = (player:boolean) => {
        player ? toast.success("Your turn.") : toast.success("Opponent's turn.");
        player ? sounds.sound_player_turn.play() : sounds.sound_opponent_turn.play();
    };

    // game actions

    const handleShipPlacement = (y:number,x:number, ship:{ id: number; name: string; length: number; direction: number[] }) => {
        var board = playerCells;
        ship.direction = dragDropRotation;

        if(gameState.turn != 0){
            toast.error(`Turn is not 0 it is ${gameState.turn} so placement not allowed`);
            return;
        };
        if(y <= 0 || y > 10 - (ship.length - 1) * ship.direction[0] ){
            //console.log(`Y ${y} is out of range (1 to ${10 - (ship.length - 1) * ship.direction[0]})`);
            return false;
        }
        if(x <= 0 || x > 10 - (ship.length - 1) * ship.direction[1] ){
            //console.log(`Y ${y} is out of range (1 to ${10 - (ship.length - 1) * ship.direction[0]})`);
            return false;
        }
        if(board[y][x].cellState != 0) {
            //console.log(`${board[y][x].cellState} val at [${x} ,${y}] is taken`);
            return false;
        }

        if(ship.direction[0] == 1){ // Y
            for (let j = Math.max(y - 1, 1) ; j < Math.min(y + ship.length + 1, 10); j++) { // check from MAX(1 before the ship, bound = 1)  to MIN (one after, bounds = 10)
                if(board[j][x].cellState != 0) return false; // check if space from y to y + ship is empty 
                if( x > 1 && board[j][x - 1].cellState != 0) return false; // check if space one left from y to y + ship is empty 
                if( x < 10 && board[j][x + 1].cellState != 0) return false; // check if space one right from y to y + ship is empty 
            } 

            for (let j = y; j < y + ship.length; j++) {
                //console.log(`ship up down ${j} ${x}`);
                
                let cellData = {cellState: 1, shipID: ship.id, shipPart: 2, direction: 'y'};
                
                if(j == y) cellData.shipPart = 1;
                else if(j == (y + ship.length - 1)) cellData.shipPart = 3;
                
                board[j][x] = cellData; 
            }
        }
        else if(ship.direction[1] == 1){ // X
            for (let i = Math.max(x - 1, 1) ; i < Math.min(x + ship.length + 1, 10); i++) { // check from MAX(1 before the ship, bound = 1)  to MIN (one after, bounds = 10)
                if(board[y][i].cellState != 0) return false; // check if space from x to x + ship is empty 
                if( y > 1 && board[y - 1][i].cellState != 0) return false; // check if space one above from x to x + ship is empty 
                if( y < 10 && board[y + 1][i].cellState != 0) return false; // check if space one below from x to x + ship is empty 
            }  

            for (let i = x; i < x + ship.length; i++) {
                //console.log(`ship left right ${y} ${i}`);
                let cellData = {cellState: 1, shipID: ship.id, shipPart: 2, direction: 'x'};

                if(i == x) cellData.shipPart= 3;
                else if(i == x + ship.length - 1) cellData.shipPart = 1;

                board[y][i] = cellData;
            }
        }

        ws.send(JSON.stringify({action: 'PlaceShip', clientID, board, shipData: {id: ship.id, name: ship.name, length: ship.length, direction: ship.direction, health: ship.length}, roomCode}))

        return true;
    }

    function handleDndConsider(e: any) {
        const {detail: {items: newShips, info: {trigger, id}}} = e;

        if(trigger == TRIGGERS.DRAG_STARTED)       {
            shipsShadow = ships;
        } 

        ships = e.detail.items;
	}

    function handleDnd(e: any) {
        const {detail: {items: newShips, info: {trigger, id}}} = e;
        if(trigger !== TRIGGERS.DROPPED_INTO_ANOTHER) ships = e.detail.items;
	}
    
    function handleDndOver(e: any, y:number, x:number) {
        const {detail: {info: {trigger}}} = e;
        if(trigger == TRIGGERS.DRAGGED_ENTERED){
            dragDropLocation = [y,x];
        }
        else{
            dragDropLocation = [];
        }
	}

    function handleDragInto(e: any, i:number, j:number) {
        const {detail: {items: newShips, info: {trigger, id}}} = e;
        let y = i;
        let x = j;

        if(dragDropLocation.length == 2){
            y = dragDropLocation[0];
            x = dragDropLocation[1];
        }

		if (trigger === TRIGGERS.DROPPED_INTO_ZONE) {
            let draggedShip;
            if(draggedShip = shipPool.find(ship => ship.id=== id)){
                if(!handleShipPlacement(y,x,{id: draggedShip.id, name: draggedShip.name, length: draggedShip.length, direction: draggedShip.direction})){
                    sounds.sound_action_negative.play();

                    toast.error('Cannot place ship there!');

                    ships = [...shipsShadow];
                }
            }
            else{
                ships = e.detail.items;
            }
		}
    }

    onMount(() => {
        roomCode = Math.random().toString().slice(2,7);
        handleInitBoards();
    });

    $: options = {
        dragDisabled: true,
        dropFromOthersDisabled: gameState.turn == 0 ? false : true,
        morphDisabled: false,
		items: placedShips,
    };
    $: shipYardOptions = {
        items: ships,
        morphDisabled: true,
        centreDraggedOnCursor: true
    };
</script>

<nav class="flex justify-between px-4 md:px-32 py-3 bg-slate-800 text-white">
    <section class="flex items-center w-72">
        <h1 class="text-2xl w-full">Generic Ship Battle Game</h1>
    </section>

    <section class="flex flex-col justify-center items-center h-20">
        {#if !ws}
        <div class="line-clamp-1">Not Connected</div>
        {:else}
        <div class="line-clamp-1">{gameState.turn === turnID ? 'Your Turn' : (gameState.turn === 2 || gameState.turn === 1 ? "Opponent's Turn" : 'Wait For Turn')}</div>
        <div class="line-clamp-1">Player Ships: {placedShips.length}</div>
        <div class="line-clamp-1">Opponent Ships: {opponentShips.length}</div>
        {/if}
    </section>

    {#if !ws}
    <form class="flex w-72 justify-end items-center" role="group" on:submit={joinRoom}>
        <input class="bg-gray-700 text-white rounded-l-md border-0 border-gray-100 py-2 px-3 max-w-40" bind:value={roomCode} placeholder="Enter room code" required minlength="5" maxlength="5" />
        <NavButton btn={{clickFn: () => {}, value: "Join Room", dir: 2}}/>
    </form>
    {:else}
    <section class="flex w-72 justify-end items-center" role="group">
        {#if gameState.turn === 0}
            <NavButton btn={{clickFn: handleGameLeave, value: "Leave", dir: 1}}/>
            <NavButton btn={{clickFn: handleGameReset, value: "Reset", dir: 0}}/>
            <NavButton btn={{clickFn: handleGameReady, value: ready ? 'UnReady' : 'Ready Up', dir: 2}}/>
        {:else}
            <NavButton btn={{clickFn: handleGameLeave, value: "Leave", dir: 3}}/>
        {/if}
    </section>
    {/if}
</nav>

<svelte:head>
    <title>Battleship {roomCode}</title> 
</svelte:head>

<main class="w-full min-h-[40vh] flex flex-wrap px-8 lg:px-20 2xl:px-32 py-12 gap-4">
    {#if !ws}
        <div class="mx-auto w-fit lg:m-0 lg:w-full flex flex-col gap-4 h-fit ">
            <h1 class="text-3xl">Join a room to play!</h1>
            <p>Enter a room code with 5 numbers. A friend with the same code will play against you.</p>
            <div class="flex flex-wrap space-x-4 items-center bg-neutral-100 rounded-md p-2 shadow-md w-fit h-fit">
                <label for="username">Enter a username:</label>
                <input name="username" placeholder="Enter a username" class="rounded-md border-gray-300 p-1 px-3 focus:ring-indigo-400" required minlength="1" maxlength="20" bind:value={username}>
            </div>
        </div>
    {:else}
        <h1 class="flex w-full text-3xl items-center justify-center lg:justify-start ">Joined room: {roomCode} ({gameState.turn === 0 ? ready ? 'Ready' : 'Not Ready' : 'In Play'})</h1>
        <div class="flex flex-wrap justify-center w-full gap-6 xl:gap-20">
            <div id="board-player" class="max-w-[196px] md:max-w-[284px] lg:max-w-[372px] flex-col space-y-4" >
                <section id="playerHeader" class="flex flex-row-reverse gap-2 w-full">
                    <div class="flex flex-wrap min-w-12 lg:min-w-16">
                        <div class="flex items-center justify-between w-full">
                            <h5 class="text-gray-500 text-sm lg:text-base text-left w-full line-clamp-1">Hits: &nbsp;</h5>
                            <h5 class="text-gray-500 text-sm lg:text-base text-right line-clamp-1">{playerScore}</h5>
                        </div>
                        <div class="flex items-center justify-between w-full">
                            <h5 class="text-rose-500 text-sm lg:text-base text-left w-full line-clamp-1">Misses: &nbsp;</h5>
                            <h5 class="text-rose-500 text-sm lg:text-base text-left font-semibold line-clamp-1">{playerMisses}</h5>
                        </div>
                        <h5 class="text-base lg:text-lg w-full line-clamp-1 text-left h-10 flex items-center pt-2">{gameState.playerStatus}</h5>
                    </div>
                    <div class="flex flex-col w-full items-start justify-end space-y-1">
                        <h1 class="text-lg xl:text-2xl w-full line-clamp-1 pl-2">{username}</h1>
                        <div class="w-full p-1 h-8">
                            <div  class="ring-gray-400 ring-2 ring-offset-2 w-full h-6 rounded shadow">
                                <div id="player-score-slider" class="bg-rose-500 h-full min-w-fit text-left px-2 rounded shadow text-white" style="width: {(playerScore / Math.max(gameState.targets, 1) * 100).toFixed(0)}%;">{playerScore}/{gameState.targets}</div>
                            </div>
                        </div>
                        
                    </div>
                </section>
                
                <div class="flex w-full flex-wrap gap-0.5" >
                    {#each playerCells as row, i}
                        <div class="flex h-4 md:h-6 lg:h-8 w-full gap-0.5">
                            {#each playerCells[i] as col, j}
                                {#if i == 0}
                                    <div class="flex justify-center items-center h-4 md:h-6 lg:h-8 shadow aspect-square shrink-0 rounded text-sm md:text-xl lg:text-2xl">
                                        {letters[j]}
                                    </div>
                                {:else if j == 0}
                                    <div class="flex justify-center items-center h-4 md:h-6 lg:h-8 shadow aspect-square shrink-0 rounded text-sm md:text-xl lg:text-2xl">
                                        {i}
                                    </div>
                                {:else}
                                    <button class="flex justify-center items-center h-4 md:h-6 lg:h-8 aspect-square shrink-0 rounded bg-sky-200 {playerCells[i][j].cellState == 0 && gameState.turn == 0 ? 'hover:bg-sky-300' : ''}" 
                                        use:dndzone={options} 
                                        on:consider={(e) => {
                                            handleDndOver(e,i,j);
                                        }}
                                        on:finalize={(e) => {
                                            handleDragInto(e, i, j);
                                        }}
                                        
                                        disabled>
                                        <div></div>
                                        <Cell cellData={{cellState: playerCells[i][j].cellState, shipPart: playerCells[i][j].shipPart, direction: playerCells[i][j].direction, isPlayer: true}}> <!-- cellState={Math.min(cells[i][j], 0)} --></Cell>
                                    </button>
                                {/if}
                            {/each} 
                        </div>
                    {/each}
                </div>
    
                <section id="playerControls" class="flex w-full gap-1">
                    <div class="w-4 md:w-6 lg:w-8 flex justify-center items-center">
                        <h3 class="-rotate-90 font-medium text-base md:text-lg lg:text-2xl text-gray-400">SHIPYARD</h3>
                    </div>
                    <div class="w-full">
                        <div class="w-full flex flex-wrap shadow gap-y-4">
                            <div id="draggableShipContainer" 
                                class="mt-4 w-full flex flex-wrap space-y-1"
                                use:dndzone={shipYardOptions} 
                                on:consider={handleDndConsider} 
                                on:finalize={(e) => {
                                    handleDnd(e);
                                }}>
                                {#each ships as ship(ship.id)}
                                    <div class="flex w-auto p-2 rounded-xl items-center justify-center {dragDropRotation[0] == 0 ? 'flex-row-reverse ' : 'flex-col '} {ship.name}"
                                    animate:flip={{ duration: 300 }}
                                    on:wheel={(e) => {e.preventDefault(); dragDropRotation = dragDropRotation[0] == 0 ? [1,0] : [0,1];}}
                                    >
                                        {#each {length: ship.length} as _, i}
                                            {#if i == 0}
                                                <section class="bow bg-gray-300 rounded-r-full h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center {dragDropRotation[0] == 0 ? '' : '-rotate-90'}"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-400" ></span></section>
                                            {:else if  i == ship.length-1}
                                                <section class="stern bg-gray-300 rounded-l-xl h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center {dragDropRotation[0] == 0 ? '' : '-rotate-90'}"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-400" ></span></section>
                                            {:else}
                                                <section class="hull bg-gray-300 h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-400" ></span></section>
                                            {/if}
                                        {/each}
                                    </div>
                                {/each}
                            </div>
    
                            <div id="ghostShipContainer" class="w-full flex flex-wrap space-y-1">
                                {#each placedShips as ship(ship.id)}
                                    <div class="flex w-auto p-2 rounded-xl items-center justify-center flex-row-reverse {ship.name}" animate:flip={{ duration: 300 }}>
                                        {#each {length: ship.length} as _, i}
                                            {#if i == 0}
                                                <section class="bow bg-gray-200 rounded-r-full h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-300" ></span></section>
                                            {:else if  i == ship.length-1}
                                                <section class="stern bg-gray-200 rounded-l-xl h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-300" ></span></section>
                                            {:else}
                                                <section class="hull bg-gray-200 h-4 md:h-6 lg:h-8 aspect-square shrink-0 flex justify-center items-center"><span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-300" ></span></section>
                                            {/if}
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
    
            <div id="board-opponent" class="max-w-[284px] md:max-w-[372px] lg:max-w-[460px] w-full flex flex-col shrink-0 space-y-4">
                {#if opponentName}
                    <section id="opponentHeader" class="flex flex-row-reverse gap-2 w-full">
                        <div class="flex flex-wrap min-w-12 lg:min-w-16">
                            <div class="flex items-center justify-between w-full">
                                <h5 class="text-gray-500 text-sm lg:text-base text-left w-full line-clamp-1">Hits: &nbsp;</h5>
                                <h5 class="text-gray-500 text-sm lg:text-base text-right line-clamp-1">{opponentScore}</h5>
                            </div>
                            <div class="flex items-center justify-between w-full">
                                <h5 class="text-rose-500 text-sm lg:text-base text-left w-full line-clamp-1">Misses: &nbsp;</h5>
                                <h5 class="text-rose-500 text-sm lg:text-base text-left font-semibold line-clamp-1">{opponentMisses}</h5>
                            </div>
                            <h5 class="text-base lg:text-lg w-full line-clamp-1 text-left h-10 flex items-center pt-2">{gameState.opponentStatus}</h5>
                        </div>
                        <div class="flex flex-col w-full items-start justify-end space-y-1">
                            <h1 class="text-lg xl:text-2xl w-full line-clamp-1 pl-2">{opponentName}</h1>
                            <div class="w-full p-1 h-8">
                                <div  class="ring-gray-400 ring-2 ring-offset-2 w-full h-6 rounded shadow">
                                    <div id="player-score-slider" class="bg-gray-600 h-full min-w-fit text-left px-2 rounded shadow text-white" style="width: {(opponentScore / Math.max(gameState.targets, 1) * 100).toFixed(0)}%;">{opponentScore}/{gameState.targets}</div>
                                </div>
                            </div>
                            
                        </div>
                    </section>

                    <div class="flex w-full flex-wrap gap-0.5" >
                        {#each opponentCells as row, i}
                            <div class="flex h-6 md:h-8 lg:h-10 w-full gap-0.5">
                                {#each opponentCells[i] as col, j}
                                    {#if i == 0}
                                        <div class="flex justify-center items-center h-6 md:h-8 lg:h-10 aspect-square shrink-0 shadow rounded text-sm md:text-2xl">
                                            {letters[j]}
                                        </div>
                                    {:else if j == 0}
                                        <div class="flex justify-center items-center h-6 md:h-8 lg:h-10 aspect-square shrink-0 shadow rounded text-sm md:text-2xl">
                                            {i}
                                        </div>
                                    {:else}
                                        <button class="flex justify-center items-center h-6 md:h-8 lg:h-10 aspect-square shrink-0 rounded bg-gray-200 {opponentCells[i][j].cellState == 0 ? 'hover:bg-gray-300': ''}"
                                            on:click={() => {
                                                if (gameState.turn === 0) {
                                                    sounds.sound_action_negative.play();
                                                    toast.error("The game has not started yet!");
                                                } else if (gameState.turn === -1){
                                                    sounds.sound_action_negative.play();
                                                    toast.error("Reset the game to play again!");
                                                } else if (gameState.turn === 1 || gameState.turn === 2){
                                                    ws.send(JSON.stringify({action: 'Shot', i, j, clientID, roomCode}));
                                                }                                       
                                            }}>
                                            <Cell cellData={{cellState: opponentCells[i][j].cellState, shipPart: opponentCells[i][j].shipPart, direction: opponentCells[i][j].direction, isPlayer: false}}> <!-- cellState={Math.min(cells[i][j], 0)} --></Cell>
                                        </button>
                                    {/if}
                                {/each} 
                            </div>
                        {/each}
                    </div>
    
                    <section id="opponentControls" class="flex w-full gap-1 min-h-36">
                        <div class="w-6 md:w-8 lg:w-10 flex justify-center items-center">
                            <h3 class="-rotate-90 font-medium text-base md:text-lg lg:text-2xl text-gray-400">GRAVEYARD</h3>
                        </div>
                        <div class="w-full">
                            <div class="w-full h-full flex shadow justify-center items-center">
                                <div id="enemyShipContainer" class="w-full flex flex-wrap justify-center items-center gap-2">
                                    {#each opponentShips as ship(ship.id)}
                                        <div class="w-auto text-xl py-2 px-4 rounded text-center {opponentShipsRaw[ship.id] == 0 ? 'line-through text-rose-700' : ''}">
                                            {(ship.name).toLocaleUpperCase()} ({ship.length})
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </section>
                {:else}
                    <h2>Waiting for opponent</h2>
                {/if}
            </div>
        </div>
    {/if}
</main>