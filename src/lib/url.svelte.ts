import { browser } from '$app/environment';

export const urlState = $state(
    {
        basePath: '',
        baseUrl: '',
        mediaPath: ''
    }
);

$effect.root(() => {
    $effect(() => {
        if (!browser) return;
        if (urlState.baseUrl) return; // guard to run only once


        const pathname = location.pathname;
        const pathsplit = pathname.split('/');
        pathsplit.pop(); // remove last segment (page)
        pathsplit.pop();
        let prefix = pathsplit.join('/');
        // normalize prefix
        if (prefix !== '/' && prefix.endsWith('/')) prefix = prefix.slice(0, -1);

        if (prefix === '' || prefix === '/') {
            urlState.basePath = '';
            urlState.baseUrl = location.origin;
        } else {
            urlState.basePath = prefix;
            urlState.baseUrl = `${location.origin}${prefix}`;
        }
        urlState.mediaPath = `${urlState.baseUrl}/media`;

        console.log('Determined basePath pop pop:', urlState.basePath);
        console.log('Determined baseUrl:', urlState.baseUrl);
    });
    return () => { };
});

export function getMedia(path: string) {
    if (browser) {
        return `${urlState.mediaPath}/${path}`;
    } else {
        return `/media/${path}`;
    }
}