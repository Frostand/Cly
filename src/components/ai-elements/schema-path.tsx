const pathParameterPattern = /(\{[^}]+\})/g;

export interface HighlightedSchemaPathProps {
  path: string;
}

export const HighlightedSchemaPath = ({ path }: HighlightedSchemaPathProps) =>
  path.split(pathParameterPattern).map((segment, index) =>
    index % 2 === 1 ? (
      <span
        className="text-info-foreground dark:text-info-foreground"
        key={`${segment}-${index}`}
      >
        {segment}
      </span>
    ) : (
      segment
    ),
  );
