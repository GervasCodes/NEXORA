// Decides what a swipe-feed slide should show for a product.
//
// `product.videos` / `product.images` (arrays the product *detail*
// endpoint returns, `images` ordered by display_order) are not part of
// the list response that feeds ProductGrid - that endpoint only ever
// returns a single cover `image_url` per product. So the feed looks both
// up lazily (current + next slide only, see ProductSwipeFeed's lookup
// effect) and passes them in as `fetchedVideoUrl` / `fetchedImages`. If a
// list response ever starts carrying `videos`/`images` itself, those win
// and no lookup is needed.
//
// For an image slide, `images` is the full ordered gallery once it's
// loaded (falling back to just the single list-view cover until then),
// and `imageIndex` is which one of those is currently on screen - this
// only clamps it to a valid position, the caller (ProductSwipeFeed) owns
// stepping through them.
export function pickFeedMedia(product, fetchedVideoUrl, fetchedImages, imageIndex = 0) {
    const video = product?.videos?.[0]?.video_url || fetchedVideoUrl || null;

    if (video) {
        return { type: "video", src: video, poster: product?.image_url || null };
    }

    const gallery =
        (product?.images?.length ? product.images.map((img) => img.image_url) : null) ||
        (fetchedImages?.length ? fetchedImages : null) ||
        (product?.image_url ? [product.image_url] : null);

    if (gallery?.length) {
        const index = Math.min(Math.max(imageIndex, 0), gallery.length - 1);
        return { type: "image", src: gallery[index], images: gallery, index };
    }

    return { type: "none" };
}
