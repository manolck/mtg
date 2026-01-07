// Transformer pour remplacer import.meta.env par process.env dans les tests
module.exports = {
  process(sourceText) {
    // Remplacer import.meta.env.VARIABLE par process.env.VARIABLE
    const transformed = sourceText
      .replace(/import\.meta\.env\.([A-Z_]+)/g, 'process.env.$1')
      .replace(/import\.meta\.env\.DEV/g, 'process.env.NODE_ENV !== "production"')
      .replace(/import\.meta\.env\.PROD/g, 'process.env.NODE_ENV === "production"');
    
    return {
      code: transformed,
    };
  },
};

