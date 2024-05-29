<script>
	import toast, { Toaster } from 'svelte-french-toast';

    import "../app.css";
</script>
  
<Toaster 
    position="bottom-right"
    reverseOrder={true}
    toastOptions={
        {duration:4000}
    }
/>
<slot />