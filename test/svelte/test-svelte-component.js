import Test from './components/TestComponent.svelte';

async function tick() {
    return new Promise((resolve, reject) => {
        requestAnimationFrame(resolve);
    });
}

export async function testComponent(t) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wrapper');
    document.body.appendChild(wrapper);

    const c = new Test({
        target: wrapper,
        props: {}
    });

    t.assert(wrapper.innerHTML === '<h1>Hello world!</h1>');

    c.$set({ name: 'Luna' });
    await tick();
    t.assert(wrapper.innerHTML === '<h1>Hello Luna!</h1>');
}
