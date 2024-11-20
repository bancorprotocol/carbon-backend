import { glob } from 'glob';
import { join } from 'path';
import * as fs from 'fs';
import { getMetadataArgsStorage } from 'typeorm';

function normalizeType(type: any): string {
  if (!type) return 'string';

  const typeStr = type.toString().toLowerCase();

  // Map TypeORM/JS types to simpler ERD types
  const typeMap: { [key: string]: string } = {
    number: 'number',
    string: 'string',
    boolean: 'boolean',
    date: 'timestamp',
    datetime: 'timestamp',
    timestamp: 'timestamp',
    text: 'text',
    varchar: 'string',
    int: 'number',
    bigint: 'number',
    float: 'number',
    double: 'number',
    decimal: 'number',
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (typeStr.includes(key)) {
      return value;
    }
  }

  return typeStr;
}

async function generateERD() {
  const entityFiles = await glob('src/**/*.entity.ts');
  await Promise.all(entityFiles.map((file) => import(join(process.cwd(), file))));

  let mermaidString = 'erDiagram\n';
  const metadata = getMetadataArgsStorage();

  metadata.tables.forEach((table) => {
    const entityName = table.name;
    const columns = metadata.columns.filter((column) => column.target === table.target);
    const relations = metadata.relations.filter((relation) => relation.target === table.target);

    mermaidString += `  ${entityName} {\n`;
    columns.forEach((column) => {
      const type = normalizeType(column.options.type);
      const pk = column.options.primary ? 'PK' : '';
      mermaidString += `    ${type} ${column.propertyName} ${pk}\n`;
    });
    mermaidString += '  }\n';

    relations.forEach((relation) => {
      const targetEntity =
        metadata.tables.find((table) => {
          const relationType = typeof relation.type === 'function' ? (relation.type as () => any)() : relation.type;
          return table.target === relationType;
        })?.name || 'Unknown';

      let relationSymbol = '';
      switch (relation.relationType.toLowerCase()) {
        case 'one-to-many':
          relationSymbol = '||--|{';
          break;
        case 'many-to-one':
          relationSymbol = '}|--||';
          break;
        case 'one-to-one':
          relationSymbol = '||--||';
          break;
        case 'many-to-many':
          relationSymbol = '}|--|{';
          break;
      }

      mermaidString += `  ${entityName} ${relationSymbol} ${targetEntity} : "${relation.propertyName}"\n`;
    });
  });

  fs.writeFileSync('erd.mmd', mermaidString);
  console.log('ERD generated as erd.mmd');
}

generateERD().catch(console.error);
