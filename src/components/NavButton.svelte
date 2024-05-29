<script lang="ts">
    import toast from "svelte-french-toast";

    // your script goes here

    export let btn:{clickFn:Function, value:string, dir:number} = {clickFn: () => {toast('click')}, value:'Click me!', dir: 0}
</script>

<!-- markup (zero or more items) goes here -->
<button
    class={`flex items-center bg-gray-700 text-white border-gray-100 py-2 hover:bg-red-700 px-3 ${btn.dir === 1 ? 'rounded-l-md border-r justify-end' : btn.dir === 2 ? 'rounded-r-md border-l justify-start' : 'justify-center ' + (btn.dir === 3 ? 'rounded-md border-0' : ' border-x')}`} 
    on:click={btn.clickFn()}
    type="submit">
    <div class={`line-clamp-1`}>
        {btn.value}
    </div>
</button>