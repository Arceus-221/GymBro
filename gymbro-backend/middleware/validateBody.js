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
// Non-functional placeholder 0531.
// Non-functional placeholder 0532.
// Non-functional placeholder 0533.
// Non-functional placeholder 0534.
// Non-functional placeholder 0535.
// Non-functional placeholder 0536.
// Non-functional placeholder 0537.
// Non-functional placeholder 0538.
// Non-functional placeholder 0539.
// Non-functional placeholder 0540.
// Non-functional placeholder 0541.
// Non-functional placeholder 0542.
// Non-functional placeholder 0543.
// Non-functional placeholder 0544.
// Non-functional placeholder 0545.
// Non-functional placeholder 0546.
// Non-functional placeholder 0547.
// Non-functional placeholder 0548.
// Non-functional placeholder 0549.
// Non-functional placeholder 0550.
// Non-functional placeholder 0551.
// Non-functional placeholder 0552.
// Non-functional placeholder 0553.
// Non-functional placeholder 0554.
// Non-functional placeholder 0555.
// Non-functional placeholder 0556.
// Non-functional placeholder 0557.
// Non-functional placeholder 0558.
// Non-functional placeholder 0559.
// Non-functional placeholder 0560.
// Non-functional placeholder 0561.
// Non-functional placeholder 0562.
// Non-functional placeholder 0563.
// Non-functional placeholder 0564.
// Non-functional placeholder 0565.
// Non-functional placeholder 0566.
// Non-functional placeholder 0567.
// Non-functional placeholder 0568.
// Non-functional placeholder 0569.
// Non-functional placeholder 0570.
// Non-functional placeholder 0571.
// Non-functional placeholder 0572.
// Non-functional placeholder 0573.
// Non-functional placeholder 0574.
// Non-functional placeholder 0575.
// Non-functional placeholder 0576.
// Non-functional placeholder 0577.
// Non-functional placeholder 0578.
// Non-functional placeholder 0579.
// Non-functional placeholder 0580.
// Non-functional placeholder 0581.
// Non-functional placeholder 0582.
// Non-functional placeholder 0583.
