import { z } from "zod";

/**
 * Shared position input schema (1-based line/column).
 * Used by most tools that operate on a specific location in a file.
 */
export const positionInput = z.object({
  filePath: z.string().describe("Absolute path to the Java source file"),
  line: z.number().int().min(1).describe("Line number (1-based, as shown by the Read tool)"),
  column: z.number().int().min(1).describe("Column number (1-based)"),
  projectRoot: z.string().optional().describe("Java project root path. Auto-detected from filePath if omitted."),
});

export type PositionInput = z.infer<typeof positionInput>;

/**
 * Convert 1-based user input to 0-based LSP coordinates.
 */
export function toZeroBased(input: PositionInput): { line: number; column: number } {
  return {
    line: input.line - 1,
    column: input.column - 1,
  };
}
