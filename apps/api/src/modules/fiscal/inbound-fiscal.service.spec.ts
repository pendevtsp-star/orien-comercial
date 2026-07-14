import { describe, expect, it } from "vitest";
import { parseFocusReceivedNfe, parseNfeXml } from "./inbound-fiscal.service";

const key = "35260712345678000199550010000000011000000010";

describe("recebimento fiscal de NF-e", () => {
  it("extrai documento, fornecedor, tributos e item do XML", () => {
    const parsed = parseNfeXml(`<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${key}"><ide><nNF>123</nNF><serie>1</serie><dhEmi>2026-07-13T10:00:00-03:00</dhEmi></ide><emit><CNPJ>19363615000100</CNPJ><xNome>Fornecedor Teste</xNome></emit><cobr><dup><nDup>001</nDup><dVenc>2026-08-13</dVenc><vDup>10.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-09-13</dVenc><vDup>10.00</vDup></dup></cobr><det nItem="1"><prod><cProd>ABC</cProd><cEAN>7891000000016</cEAN><xProd>Produto Teste</xProd><NCM>22021000</NCM><CEST>0300700</CEST><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2</qCom><vUnCom>10</vUnCom><vProd>20</vProd></prod><imposto><ICMS><ICMS00><CST>00</CST></ICMS00></ICMS></imposto></det><total><ICMSTot><vNF>20</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`);
    expect(parsed.document).toMatchObject({ key, number: "123", series: "1", totalAmount: 20 });
    expect(parsed.supplier).toMatchObject({ name: "Fornecedor Teste", document: "19363615000100" });
    expect(parsed.items[0]).toMatchObject({ barcode: "7891000000016", ncm: "22021000", cest: "0300700", cfop: "5102", taxCode: "00", quantity: 2, unitCost: 10 });
    expect(parsed.document.paymentSchedule).toEqual([{ number: "001", dueDate: "2026-08-13", amount: 10 }, { number: "002", dueDate: "2026-09-13", amount: 10 }]);
  });

  it("recusa entidades externas antes de analisar o XML", () => {
    expect(() => parseNfeXml(`<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFe />`)).toThrow("declaração externa não permitida");
  });

  it("normaliza a consulta completa recebida da Focus NFe", () => {
    const parsed = parseFocusReceivedNfe({ numero: "456", serie: "2", nome_emitente: "Distribuidora", cnpj_emitente: "19363615000100", valor_total: 15, itens: [{ codigo_produto: "P-1", descricao: "Item", codigo_gtin: "7891000000016", quantidade_comercial: 3, valor_unitario_comercial: 5, ncm: "22021000" }] }, key);
    expect(parsed.document).toMatchObject({ key, number: "456", totalAmount: 15 });
    expect(parsed.items[0]).toMatchObject({ name: "Item", quantity: 3, unitCost: 5 });
  });
});
