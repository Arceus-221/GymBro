const validateBody = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: parsed.error.issues[0]?.message || 'Request body failed validation.',
    });
  }

  req.body = parsed.data;
  next();
};

module.exports = validateBody;
