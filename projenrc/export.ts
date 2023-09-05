import {
  Project,
  SourceFile,
  Type,
  JSDocStructure,
  StructureKind,
} from "ts-morph";

const isDebug = false;
function debug(message: string) {
  if (isDebug) {
    console.log(message);
  }
}

export type BuildInstruction = {
  targetFile: string;
  sourceTypes: Array<{
    file: string;
    type: string;
  }>;
};

// Keep set of visited classNames
const visitedClassNames = new Set<string>();
export function exportTypes(
  projectPathsGlob: string,
  buildInstructions: Array<BuildInstruction>,
) {
  const project = new Project();
  project.addSourceFilesAtPaths(projectPathsGlob);
  // // print all sourceFiles in project
  // for (const sourceFile of project.getSourceFiles()) {
  //   debug("SourceFile: " + sourceFile.getFilePath());
  // }

  // NOTE: Assumes the type is a class
  // (DataDog autogen tooling creates class definitions)
  // Create a new source file for each build instruction
  for (const instruction of buildInstructions) {
    const newFile = project.createSourceFile(
      instruction.targetFile,
      {},
      { overwrite: true },
    );
    for (const sourceType of instruction.sourceTypes) {
      classToJSIIInterface(
        project.getSourceFileOrThrow(sourceType.file),
        sourceType.type,
        newFile,
      );
    }
    newFile.saveSync();
  }
}

/**
 * Convert a DataDog API Client class to a JSII compatible Interface
 *
 * @param sourceFile the source file containing the Class Declaration
 * @param className the name of the class to convert
 * @param newSource the new source file to add the interface to
 * @returns void
 */
function classToJSIIInterface(
  sourceFile: SourceFile,
  className: string,
  newSource: SourceFile,
) {
  if (visitedClassNames.has(className)) {
    debug(`Already exported ${className} - skipping`);
    return;
  }
  visitedClassNames.add(className);
  console.log(`Exporting ${className}`);

  const classDeclaration = sourceFile.getClassOrThrow(className);
  const interfaceDeclaration = newSource.addInterface({
    name: className,
    isExported: true,
  });
  for (const property of classDeclaration
    .getProperties()
    // drop properties that start with "_ or are attributeTypeMap
    .filter(
      (p) =>
        !(p.getName() === "attributeTypeMap" || p.getName().startsWith('"_')),
    )) {
    const propertyType = property.getType();
    const propertyName = property.getName();
    const propertyIsOptional = property.hasQuestionToken();
    const propertyDocs: JSDocStructure[] = property.getJsDocs().map((doc) => ({
      kind: StructureKind.JSDoc,
      description: doc.getInnerText(),
    }));
    if (propertyName === "_data") {
      propertyDocs.push({
        kind: StructureKind.JSDoc,
        tags: [
          {
            tagName: "internal",
          },
        ],
      });
    }
    // add property to interface with new type
    interfaceDeclaration.addProperty({
      name: propertyName,
      hasQuestionToken: propertyIsOptional,
      type: handleType(
        className,
        propertyName,
        propertyType,
        propertyIsOptional,
        newSource,
      ),
      isReadonly: true,
      docs: propertyDocs,
    });
  }
}

/**
 * Convert a Type to a string representation of the type
 * Including declarations from other files.
 *
 * @param className to print in debug logs
 * @param propertyName to print in debug logs
 * @param propertyType to determine property type in new interface
 * @param isOptional to evaluate if undefined should be filtered out
 * @param newSource to add new interfaces to
 * @returns
 */
function handleType(
  className: string,
  propertyName: string,
  propertyType: Type,
  isOptional: boolean,
  newSource: SourceFile,
): string {
  debug(
    `Class: ${className} Property: ${propertyName}  - type ${propertyType.getText()}`,
  );

  if (isPrimitive(propertyType)) {
    debug("  is primitive");
    return propertyType.getText();
  }

  if (propertyType.isUnion()) {
    debug("  is union type");
    // Sort the union types such that Undefined comes last always; taken from https://stackoverflow.com/a/29829370
    const [first, ...rest] = propertyType
      .getUnionTypes()
      // filter out undefined if isOptional
      .filter((type) => !(isOptional && type.isUndefined()))
      .sort(
        (a: Type, b: Type) =>
          (a.isUndefined() as any) - (b.isUndefined() as any) ||
          +(a > b) ||
          -(a < b),
      );

    if (!first) {
      return "undefined";
    }

    // concatenate the types together with " | " to create a union type
    return (
      handleType(className, propertyName, first, isOptional, newSource) +
      " | " +
      rest
        .map((restEl) =>
          handleType(className, propertyName, restEl, isOptional, newSource),
        )
        .join(" | ")
    );
  }

  if (propertyType.isArray()) {
    const subType = propertyType.getArrayElementTypeOrThrow();
    if (isPrimitive(subType)) {
      return `${handleType(
        className,
        propertyName,
        subType,
        isOptional,
        newSource,
      )}[]`;
    } else {
      return `Array<${handleType(
        className,
        propertyName,
        subType,
        isOptional,
        newSource,
      )}>`;
    }
  }

  if (propertyType.isTuple()) {
    const types = propertyType.getTupleElements();
    ///TODO: JSII does not support tuples, this removes the requirements on min and max element count
    return [
      "Array<",
      types
        .map((type) =>
          handleType(className, propertyName, type, isOptional, newSource),
        )
        .join(" | "),
      ">",
    ].join("");
  }

  if (propertyType.isObject()) {
    // modelled after https://github.com/dsherret/ts-morph/issues/662
    const isBuiltInType = propertyType
      .getSymbolOrThrow()
      .getDeclarations()
      .some((d) =>
        d.getSourceFile().getFilePath().includes("node_modules/typescript/lib"),
      );
    if (isBuiltInType) {
      debug("   is built in type");
      debug("   " + propertyType.getText());
      // declarations
      debug(
        "  " +
          propertyType
            .getSymbolOrThrow()
            .getDeclarations()
            .map((d) => d.getSourceFile().getFilePath()),
      );
      return propertyType.getText();
    } else {
      // determine declaration file
      const symbol = propertyType.getSymbol();
      if (symbol) {
        for (const declaration of symbol.getDeclarations()) {
          const sourceOfFileWithDeclaration = declaration.getSourceFile();
          debug(
            "  Import is from:" + sourceOfFileWithDeclaration.getFilePath(),
          );
          // add interface for declaration
          classToJSIIInterface(
            sourceOfFileWithDeclaration,
            symbol.getName(),
            newSource,
          );
          return symbol.getName();
        }
      } else {
        console.log(
          `Warning: Could not find Class: ${className} Property: ${propertyName}  - type ${propertyType.getText()}`,
        );
      }
      return "undefined";
    }
  }
  console.log(`Warning: Unhandled type: ${propertyType.getText()} - skipping`);
  return propertyType.getText();
}

function isPrimitive(type: Type) {
  if (type.isString()) {
    return true;
  }
  if (type.isStringLiteral()) {
    return true;
  }
  if (type.isUndefined()) {
    return true;
  }
  if (type.isNull()) {
    return true;
  }
  if (type.isUnknown()) {
    return true;
  }
  if (type.isAny()) {
    return true;
  }
  if (type.isNumber()) {
    return true;
  }
  if (type.isNumberLiteral()) {
    return true;
  }
  if (type.isBoolean()) {
    return true;
  }
  if (type.isBooleanLiteral()) {
    return true;
  }
  if (intrinsicNameOf(type) === "void") {
    // isVoid
    return true;
  }
  return false;
}

function intrinsicNameOf(type: Type) {
  return (type.compilerType as unknown as { intrinsicName: string })
    .intrinsicName;
}
