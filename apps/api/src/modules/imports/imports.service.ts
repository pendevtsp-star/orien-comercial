import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { customerCreateSchema, productCreateSchema, type ImportPreviewInput } from "@sgc/types";
import ExcelJS from "exceljs";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";

@Injectable()
export class ImportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async template(entityType: "products" | "customers") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(entityType === "products" ? "Produtos" : "Clientes");
    const columns =
      entityType === "products"
        ? [
            ["nome", "Café Tradicional 500g"],
            ["sku", "CAF-500"],
            ["codigo_de_barras", "7891000000016"],
            ["descricao", "Produto de exemplo"],
            ["unidade", "un"],
            ["custo", 12.5],
            ["preco", 19.9],
            ["estoque_minimo", 10],
          ]
        : [
            ["nome", "Cliente Exemplo"],
            ["tipo", "individual"],
            ["documento", "000.000.000-00"],
            ["telefone", "(11) 99999-9999"],
            ["whatsapp", "(11) 99999-9999"],
            ["email", "cliente@example.com"],
            ["cidade", "São Paulo"],
            ["estado", "SP"],
          ];
    sheet.addRow(columns.map(([header]) => header));
    sheet.addRow(columns.map(([, value]) => value));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async preview(context: TenantContext, input: ImportPreviewInput) {
    let workbook: ExcelJS.Workbook;
    try {
      workbook = new ExcelJS.Workbook();
      const bytes = Uint8Array.from(Buffer.from(input.fileBase64, "base64"));
      await workbook.xlsx.load(bytes.buffer);
    }
    catch { throw new BadRequestException("Arquivo Excel invalido ou corrompido."); }
    const sheet = workbook.worksheets[0]; if (!sheet || sheet.rowCount < 2) throw new BadRequestException("A planilha precisa conter cabecalho e ao menos uma linha.");
    const headers = sheet.getRow(1).values as unknown[]; const rows: Record<string, unknown>[] = []; const errors: Array<{ row: number; messages: string[] }> = [];
    for (let index=2;index<=sheet.rowCount;index++) { const values=sheet.getRow(index).values as unknown[]; const raw:Record<string,unknown>={}; for(let col=1;col<headers.length;col++){const key=normalizeHeader(textValue(headers[col]));if(key)raw[key]=cellValue(values[col]);} if(!Object.values(raw).some((value)=>value!==undefined&&value!==""))continue; const normalized=normalizeRow(input.entityType,raw); const parsed=(input.entityType==="products"?productCreateSchema:customerCreateSchema).safeParse(normalized); if(parsed.success)rows.push(parsed.data);else errors.push({row:index,messages:parsed.error.issues.map((issue)=>`${issue.path.join(".")}: ${issue.message}`)}); }
    const job=await this.database.tenantQuery<{ id:string }>(context.tenantId,`INSERT INTO import_jobs (tenant_id,entity_type,status,total_rows,rejected_rows,errors,preview_data,created_by_user_id) VALUES ($1,$2,'preview',$3,$4,$5,$6,$7) RETURNING id`,[context.tenantId,input.entityType,rows.length+errors.length,errors.length,JSON.stringify(errors),JSON.stringify(rows),context.userId??null]);
    return { jobId:job.rows[0]!.id,entityType:input.entityType,totalRows:rows.length+errors.length,validRows:rows.length,rejectedRows:errors.length,errors,preview:rows.slice(0,20) };
  }

  async commit(context:TenantContext,jobId:string,ignoreRejectedRows=false){return this.database.tenantTransaction(context.tenantId,async(client)=>{const result=await client.query<{entity_type:string;status:string;rejected_rows:number;preview_data:Record<string,unknown>[];errors:Array<{row:number;messages:string[]}>}>("SELECT entity_type,status,rejected_rows,preview_data,errors FROM import_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[context.tenantId,jobId]);const job=result.rows[0];if(!job)throw new BadRequestException("Importacao nao encontrada.");if(job.status!=="preview")throw new BadRequestException("Importacao ja processada.");if(job.rejected_rows>0&&!ignoreRejectedRows)throw new BadRequestException("Corrija as linhas rejeitadas ou importe somente as linhas validas.");let imported=0;for(const row of job.preview_data){if(job.entity_type==="products"){const parsed=productCreateSchema.parse(row);await client.query(`INSERT INTO products (tenant_id,branch_id,category_id,name,sku,barcode,description,unit,cost_price,sale_price,promotional_price,min_stock,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[context.tenantId,parsed.branchId??null,parsed.categoryId??null,parsed.name,parsed.sku??null,parsed.barcode??null,parsed.description??null,parsed.unit,parsed.costPrice,parsed.salePrice,parsed.promotionalPrice??null,parsed.minStock,parsed.isActive]);}else{const parsed=customerCreateSchema.parse(row);await client.query(`INSERT INTO customers (tenant_id,branch_id,type,name,document,phone,whatsapp,email,birth_date,address_line1,city,state,zip_code,tags,notes,communication_opt_in,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[context.tenantId,parsed.branchId??null,parsed.type,parsed.name,parsed.document??null,parsed.phone??null,parsed.whatsapp??null,parsed.email??null,parsed.birthDate??null,parsed.addressLine1??null,parsed.city??null,parsed.state??null,parsed.zipCode??null,parsed.tags,parsed.notes??null,parsed.communicationOptIn,parsed.isActive]);}imported++;}await client.query("UPDATE import_jobs SET status='completed',imported_rows=$3,completed_at=now() WHERE tenant_id=$1 AND id=$2",[context.tenantId,jobId,imported]);await client.query("INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'import.completed','import_job',$3,$4)",[context.tenantId,context.userId??null,jobId,JSON.stringify({entityType:job.entity_type,imported,rejected:job.rejected_rows,ignoredRejectedRows:ignoreRejectedRows,errors:job.errors??[]})]);return{ok:true,importedRows:imported,rejectedRows:job.rejected_rows,ignoredRejectedRows:ignoreRejectedRows};});}
}

function normalizeHeader(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
function cellValue(value:unknown){if(value&&typeof value==="object"&&"text" in value){const text=value.text;return typeof text==="string"||typeof text==="number"?String(text):undefined;}if(value instanceof Date)return value.toISOString().slice(0,10);return value;}
function normalizeRow(type:"products"|"customers",row:Record<string,unknown>){if(type==="products")return{name:pick(row,"nome","name"),sku:optional(pick(row,"sku","codigo")),barcode:optional(pick(row,"codigo_de_barras","barcode","ean")),description:optional(pick(row,"descricao","description")),unit:textValue(pick(row,"unidade","unit"))||"un",costPrice:numberValue(pick(row,"custo","preco_de_custo","cost_price")),salePrice:numberValue(pick(row,"preco","preco_de_venda","sale_price")),minStock:numberValue(pick(row,"estoque_minimo","min_stock")),isActive:true};return{name:pick(row,"nome","name"),type:textValue(pick(row,"tipo","type"))==="company"?"company":"individual",document:optional(pick(row,"documento","cpf_cnpj","document")),phone:optional(pick(row,"telefone","phone")),whatsapp:optional(pick(row,"whatsapp")),email:optional(pick(row,"email")),city:optional(pick(row,"cidade","city")),state:optional(pick(row,"uf","estado","state")),tags:[],communicationOptIn:false,isActive:true};}
function pick(row:Record<string,unknown>,...keys:string[]){for(const key of keys)if(row[key]!==undefined&&row[key]!=="")return row[key];return undefined;}
function textValue(value:unknown){return typeof value==="string"||typeof value==="number"?String(value):"";}
function optional(value:unknown){const text=textValue(value).trim();return text||undefined;}
function numberValue(value:unknown){const text=textValue(value);if(!text)return 0;return Number(text.replace(",","."));}
