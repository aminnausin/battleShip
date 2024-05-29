<script lang="ts">
    import { fade } from 'svelte/transition'

    export let cellData:{cellState:number, shipPart:number; direction:string; isPlayer:boolean} = {cellState: 0, shipPart: 1, direction: 'y', isPlayer:true}

    let debug = false;
</script>
    {#if cellData.cellState == -1}
    <span in:fade={{duration: 80}} class="z-10 w-[50%] h-[50%] rounded-full {cellData.isPlayer ? 'bg-sky-500' : 'bg-slate-700'}" ></span>
    {:else if cellData.shipPart > 0 && cellData.isPlayer}
    <section class="h-full w-full flex justify-center items-center 
        {cellData.isPlayer ? ' bg-gray-300 ' : ' '}
        {cellData.shipPart == 1 ? 
            ( cellData.direction === 'x' ? 'rounded-r-full bow' : 'rounded-t-full bow'): 
            ( cellData.shipPart == 3 ? 
                ( cellData.direction === 'x' ? 'rounded-l-lg hull' : 'rounded-b-lg hull')
            : 'stern')
        }">
        {#if cellData.cellState == -2}
            <span in:fade={{duration: 80}} class="z-10 w-[50%] h-[50%] rounded-full bg-rose-500"></span>
        {:else}
            <span class="z-9 w-[40%] h-[40%] rounded-full bg-gray-400" ></span>
        {/if}
    </section>
    {:else if cellData.cellState == -2 && !cellData.isPlayer}
    <span in:fade={{duration: 80}} class="z-10 w-[50%] h-[50%] rounded-full bg-rose-500"></span>
    {/if}