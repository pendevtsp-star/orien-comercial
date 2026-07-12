import type { Metadata } from "next";
export const metadata: Metadata={title:"Orien Admin",description:"Backoffice interno da Orien",icons:{icon:"/icon.svg"}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
