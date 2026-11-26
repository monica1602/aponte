import { PAYMENT_INFO_MAX } from "@/lib/event-price";
import { inputCls } from "@/components/ui";

/** Gratuito/Pago; os campos de pagamento so aparecem quando "Pago" esta marcado (CSS, sem JavaScript). */
export function EventPricingFields({ price = "", paymentUrl = "", paymentInfo = "" }: { price?: string; paymentUrl?: string; paymentInfo?: string }) {
  const paid = price !== "";
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs text-muted">Valor da inscricao</legend>
      <input id="pricing-free" type="radio" name="pricing" value="free" defaultChecked={!paid} className="peer/free" />
      <label htmlFor="pricing-free" className="ml-1.5 mr-4 text-sm">Gratuito</label>
      <input id="pricing-paid" type="radio" name="pricing" value="paid" defaultChecked={paid} className="peer/paid" />
      <label htmlFor="pricing-paid" className="ml-1.5 text-sm">Pago</label>
      <div className="hidden space-y-2 peer-checked/paid:block">
        <input name="price" type="text" inputMode="decimal" defaultValue={price} placeholder="Valor em R$ (ex.: 50,00)" aria-label="Valor em R$" className={inputCls} />
        <input name="payment_url" type="text" inputMode="url" maxLength={500} defaultValue={paymentUrl} placeholder="Link de pagamento (opcional, ex.: sympla.com.br/meu-evento)" aria-label="Link de pagamento" className={inputCls} />
        <textarea name="payment_info" rows={2} maxLength={PAYMENT_INFO_MAX} defaultValue={paymentInfo} placeholder="Instrucoes de pagamento (opcional, ex.: Pix para a chave tal e envie o comprovante por mensagem)" aria-label="Instrucoes de pagamento" className={inputCls} />
        <p className="text-xs text-muted">O pagamento e feito direto com voce, fora da Ponte. As inscricoes ficam sujeitas a sua aprovacao: aprove cada pessoa depois de conferir o pagamento. O link e as instrucoes so aparecem para quem pedir a inscricao.</p>
      </div>
    </fieldset>
  );
}
