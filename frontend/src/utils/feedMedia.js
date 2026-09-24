// Decides what a swipe-feed slide should show for a product.
//
// `product.videos` (an array of { id, video_url, display_order }) is what
// the product *detail* endpoint returns. The list endpoint that feeds
// ProductGrid does not include it, so the feed looks videos up lazily and
// passes the first URL in as `fetchedVideoUrl`. If a list response ever
// starts carrying `videos`, that wins and no lookup is needed.
export function pickFeedMedia(product, fetchedVideoUrl) {
    const video = product?.videos?.[0]?.video_url || fetchedVideoUrl || null;

    if (video) {
        return { type: "video", src: video, poster: product?.image_url || null };
    }
    if (product?.image_url) {
        return { type: "image", src: product.image_url };
    }
    return { type: "none" };
}
