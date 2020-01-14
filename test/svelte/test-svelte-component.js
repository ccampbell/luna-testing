import Test from './components/TestComponent.svelte';

async function tick() {
    return new Promise((resolve, reject) => {
        requestAnimationFrame(resolve);
    });
}

export async function testComponent(t) {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const c = new Test({
        target,
        props: {}
    });

    t.assert(target.innerHTML === '<h1>Hello world!</h1>');

    c.$set({ name: 'Luna' });
    await tick();
    t.assert(target.innerHTML === '<h1>Hello Luna!</h1>');
}
