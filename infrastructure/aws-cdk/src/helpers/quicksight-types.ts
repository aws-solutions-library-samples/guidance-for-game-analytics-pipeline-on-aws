export interface ColumnDefinition {
  name: string;
  type: 'STRING' | 'INTEGER' | 'DECIMAL' | 'DATETIME';
}

export interface DataSetDefinition {
  viewName: string;
  columns: ColumnDefinition[];
  /** Optional custom SQL query. When provided, replaces the default `SELECT * FROM schema.viewName`. Use `{db_name}` as placeholder for the schema-qualified table path. */
  customSqlQuery?: string;
  /** Optional calculated columns to add via LogicalTableMap DataTransforms */
  calculatedColumns?: Array<{ columnName: string; columnId: string; expression: string }>;
  /** Optional column groups (e.g., for geospatial columns that need a geographic role) */
  columnGroups?: Array<{ geoSpatialColumnGroup: { name: string; countryCode: string; columns: string[] } }>;
}
