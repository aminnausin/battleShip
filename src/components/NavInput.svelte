<script lang="ts">
    import toast from "svelte-french-toast";

    // your script goes here

    export let inp:{placeholder: string, dir:number, len:number} = {placeholder:'Type me!', dir: 0, len:4}
    export let roomCode = ''

</script>

<!-- markup (zero or more items) goes here -->
<input  type="text" 
        class={`bg-gray-700 text-whiteborder-gray-100 py-2 px-3 ${inp.dir === 1 ? 'rounded-l-md border-r justify-end' : inp.dir === 2 ? 'rounded-r-md border-l justify-start' : ' border-x justify-center'}`} 
        bind:value={roomCode} 
        placeholder={inp.placeholder}
        minlength={inp.len}
        maxlength={inp.len}
        required />
