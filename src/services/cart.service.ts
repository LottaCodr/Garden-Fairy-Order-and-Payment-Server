import { Cart, ICart } from '@src/models/cart.model';

/**
 * Merge a guest (session) cart into a user's cart on sign-in / sign-up.
 * Matching lines (same product + size) are summed; the guest cart is then
 * deleted. No-op when no guest cart exists.
 */
export const mergeGuestCart = async (
  sessionId: string | undefined,
  userId: string,
): Promise<ICart | null> => {
  if (!sessionId) return null;

  const guestCart = await Cart.findOne({ sessionId });
  if (!guestCart || guestCart.items.length === 0) {
    if (guestCart) await guestCart.deleteOne();
    return null;
  }

  let userCart = await Cart.findOne({ user: userId });
  if (!userCart) {
    // Adopt the guest cart wholesale.
    guestCart.sessionId = undefined;
    guestCart.user = userId as never;
    await guestCart.save();
    return guestCart;
  }

  for (const guestItem of guestCart.items) {
    const existing = userCart.items.find(
      (it) =>
        it.product.toString() === guestItem.product.toString() &&
        (it.size ?? null) === (guestItem.size ?? null),
    );
    if (existing) {
      existing.qty += guestItem.qty;
    } else {
      userCart.items.push({
        product: guestItem.product,
        qty: guestItem.qty,
        size: guestItem.size,
      });
    }
  }

  await userCart.save();
  await guestCart.deleteOne();
  return userCart;
};
