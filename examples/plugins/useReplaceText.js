const useReplaceText = (data, replacements) => {
  try {
    if (typeof data !== "string") {
      throw new Error("Data must be a string");
    }

    if (!replacements || typeof replacements !== "string") {
      throw new Error("Replacements must be provided as a string");
    }

    // parse the replacement string
    // format: "string1:replacement1,string2:replacement2"
    const replacementPairs = replacements.split(",").reduce((pairs, pair) => {
      const [search, replace] = pair.split(":");
      if (search && replace) {
        pairs.push({
          search: search.trim(),
          replace: replace.trim(),
        });
      }
      return pairs;
    }, []);

    if (replacementPairs.length === 0) {
      throw new Error("No valid replacement pairs found");
    }


    let modifiedText = data;
    for (const { search, replace } of replacementPairs) {
      const regex = new RegExp(search, "g");
      modifiedText = modifiedText.replace(regex, replace);
    }

    console.log("🔄 Replaced:");
    replacementPairs.forEach(({ search, replace }) => {
      console.log(`  "${search}" → "${replace}"`);
    });

    return modifiedText;
  } catch (error) {
    console.error("❌ Error in text replacement:", error.message);
    return data;
  }
};

module.exports = { useReplaceText };
