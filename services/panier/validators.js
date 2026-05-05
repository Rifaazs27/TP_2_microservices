// validators.js — À implémenter selon le service
function validateProduct(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name: requis, doit être une chaîne non vide');
  }
  if (body.name && body.name.length > 100) {
    errors.push('name: 100 caractères maximum');
  }
  if (body.price === undefined || body.price === null) {
    errors.push('price: requis');
  } else if (typeof body.price !== 'number' || isNaN(body.price) || body.price <= 0) {
    errors.push('price: doit être un nombre strictement positif');
  }
  if (body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      errors.push('stock: doit être un entier non négatif');
    }
  }
  const validCategories = ['electronics', 'accessories', 'clothing', 'food', 'other'];
  if (body.category !== undefined && !validCategories.includes(body.category)) {
    errors.push(`category: doit être l'une de ces valeurs : ${validCategories.join(', ')}`);
  }
  return errors;
}

function validateOrder(body) {
  const errors = [];
  if (!body.userId || typeof body.userId !== 'string' || body.userId.trim() === '') {
    errors.push('userId: requis, doit être une chaîne non vide');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items: requis, doit être un tableau non vide');
  } else {
    body.items.forEach((item, i) => {
      if (!item.productId || typeof item.productId !== 'number') {
        errors.push(`items[${i}].productId: requis, doit être un nombre`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`items[${i}].quantity: doit être un entier ≥ 1`);
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        errors.push(`items[${i}].unitPrice: doit être un nombre positif`);
      }
    });
  }
  if (!body.shippingAddress || typeof body.shippingAddress !== 'string' || body.shippingAddress.trim() === '') {
    errors.push('shippingAddress: requis, doit être une chaîne non vide');
  }
  return errors;
}

module.exports = { validateProduct, validateOrder };
