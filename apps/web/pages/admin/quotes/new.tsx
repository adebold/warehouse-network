import type { Order, Warehouse, Customer } from '@warehouse/types';
import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { RFQ, Warehouse, ChargeCategory } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Trash2, Package, CreditCard, FileText, Info } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import QuoteFormSkeleton from '@/components/quotes/QuoteFormSkeleton';

interface NewQuoteProps {
  rfq: RFQ;
  warehouses: Warehouse[];
  chargeCategories: ChargeCategory[];
}

const NewQuote: NextPage<NewQuoteProps> = ({ rfq, warehouses, chargeCategories }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    warehouseId: '',
    items: [] as {
      chargeCategoryId: string;
      unitPrice: number;
      quantity: number;
      description: string;
    }[],
    currency: 'USD',
    assumptions: '',
    guaranteedCharges: false,
    depositAmount: 0,
    accrualStartRule: 'ON_RECEIPT',
    expiryDate: '',
    paymentMethod: 'INVOICE',
    paymentTerms: 'NET30',
    poNumber: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized');
  }, [session, status, router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prevState => {
      const newItems = [...prevState.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prevState, items: newItems };
    });
  };

  const handleAddItem = () => {
    setFormData(prevState => ({
      ...prevState,
      items: [
        ...prevState.items,
        { chargeCategoryId: '', unitPrice: 0, quantity: 1, description: '' },
      ],
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.warehouseId) {
      newErrors.warehouseId = 'Please select a warehouse';
    }

    if (formData.items.length === 0) {
      newErrors.items = 'Please add at least one item';
    }

    if (!formData.expiryDate) {
      newErrors.expiryDate = 'Please set an expiry date';
    }

    if (formData.paymentMethod === 'PO' && !formData.poNumber) {
      newErrors.poNumber = 'PO number is required for Purchase Order payment';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, rfqId: rfq.id }),
      });

      if (response.ok) {
        const newQuote = await response.json();
        router.push(`/admin/quotes/${newQuote.id}`);
      } else {
        const errorData = await response.json();
        console.error('Failed to create quote', errorData);
        alert('Failed to create quote');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while creating the quote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <QuoteFormSkeleton />;
  }

  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return <div className="flex min-h-screen items-center justify-center">Unauthorized</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/rfqs"
            className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to RFQs
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Create Quote</h1>
          <p className="text-muted-foreground mt-2">Create a new quote for RFQ #{rfq.id}</p>
        </div>

        {/* RFQ Details Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>RFQ Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label className="text-sm text-gray-500">Customer ID</Label>
                <p className="font-medium">{rfq.customerId}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Estimated Skids</Label>
                <p className="font-medium">{rfq.estimatedSkidCount}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Status</Label>
                <p className="font-medium capitalize">{rfq.status.toLowerCase()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quote Form */}
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Quote Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="warehouseId">
                    Warehouse <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    name="warehouseId"
                    value={formData.warehouseId}
                    onValueChange={value => setFormData(prev => ({ ...prev, warehouseId: value }))}
                  >
                    <SelectTrigger className={errors.warehouseId ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select a warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map(wh => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.warehouseId && (
                    <p className="text-sm text-red-500">{errors.warehouseId}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    type="text"
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    placeholder="USD"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assumptions">Assumptions</Label>
                <Textarea
                  id="assumptions"
                  name="assumptions"
                  value={formData.assumptions}
                  onChange={handleChange}
                  placeholder="Enter any assumptions for this quote"
                  rows={4}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="guaranteedCharges"
                  checked={formData.guaranteedCharges}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, guaranteedCharges: checked as boolean }))
                  }
                />
                <Label htmlFor="guaranteedCharges" className="cursor-pointer">
                  Guaranteed Charges
                </Label>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount</Label>
                  <Input
                    type="number"
                    id="depositAmount"
                    name="depositAmount"
                    value={formData.depositAmount}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accrualStartRule">Accrual Start Rule</Label>
                  <Select
                    name="accrualStartRule"
                    value={formData.accrualStartRule}
                    onValueChange={value =>
                      setFormData(prev => ({ ...prev, accrualStartRule: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ON_RECEIPT">On Receipt</SelectItem>
                      <SelectItem value="FIXED_DATE">Fixed Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">
                  Expiry Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  id="expiryDate"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleChange}
                  className={errors.expiryDate ? 'border-red-500' : ''}
                />
                {errors.expiryDate && <p className="text-sm text-red-500">{errors.expiryDate}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Payment Information Card */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <CardTitle>Payment Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">
                    Payment Method <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    name="paymentMethod"
                    value={formData.paymentMethod}
                    onValueChange={value => {
                      setFormData(prev => ({ ...prev, paymentMethod: value }));
                      // Clear PO number if not using PO payment method
                      if (value !== 'PO') {
                        setFormData(prev => ({ ...prev, poNumber: '' }));
                        setErrors(prev => ({ ...prev, poNumber: '' }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INVOICE">Invoice</SelectItem>
                      <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                      <SelectItem value="ACH">ACH Transfer</SelectItem>
                      <SelectItem value="WIRE">Wire Transfer</SelectItem>
                      <SelectItem value="PO">Purchase Order (PO)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Select
                    name="paymentTerms"
                    value={formData.paymentTerms}
                    onValueChange={value => setFormData(prev => ({ ...prev, paymentTerms: value }))}
                    disabled={formData.paymentMethod === 'CREDIT_CARD'}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                      <SelectItem value="NET15">Net 15</SelectItem>
                      <SelectItem value="NET30">Net 30</SelectItem>
                      <SelectItem value="NET45">Net 45</SelectItem>
                      <SelectItem value="NET60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.paymentMethod === 'PO' && (
                <div className="space-y-2">
                  <Label htmlFor="poNumber">
                    Purchase Order Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="poNumber"
                    name="poNumber"
                    value={formData.poNumber}
                    onChange={handleChange}
                    placeholder="e.g., PO-2024-001"
                    className={errors.poNumber ? 'border-red-500' : ''}
                  />
                  {errors.poNumber && <p className="text-sm text-red-500">{errors.poNumber}</p>}
                </div>
              )}

              {formData.paymentMethod === 'CREDIT_CARD' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Credit card payments are processed immediately upon quote acceptance. Payment
                    terms do not apply.
                  </AlertDescription>
                </Alert>
              )}

              {formData.paymentMethod === 'WIRE' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Wire transfer instructions will be provided upon quote acceptance.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quote Items</CardTitle>
                <Button type="button" onClick={handleAddItem} size="sm" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {formData.items.length === 0 ? (
                <div className="py-8 text-center">
                  <Package className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                  <p className="text-gray-600">No items added yet</p>
                  <Button type="button" onClick={handleAddItem} className="mt-4" variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Item
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={index} className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">Item {index + 1}</h4>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setFormData(prev => ({
                              ...prev,
                              items: prev.items.filter((_, i) => i !== index),
                            }))
                          }
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Charge Category</Label>
                          <Select
                            value={item.chargeCategoryId}
                            onValueChange={value =>
                              handleItemChange(index, 'chargeCategoryId', value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select charge category" />
                            </SelectTrigger>
                            <SelectContent>
                              {chargeCategories.map(category => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Unit Price</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={e =>
                              handleItemChange(index, 'unitPrice', parseFloat(e.target.value))
                            }
                            step="0.01"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            placeholder="1"
                            value={item.quantity}
                            onChange={e =>
                              handleItemChange(index, 'quantity', parseInt(e.target.value, 10))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            type="text"
                            placeholder="Item description"
                            value={item.description}
                            onChange={e => handleItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="mt-8 flex justify-end gap-4">
            <Link href="/admin/rfqs">
              <Button variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Quote'}
            </Button>
          </div>

          {errors.items && (
            <Alert className="mt-4" variant="destructive">
              <AlertDescription>{errors.items}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const { rfqId } = context.query;

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const rfq = await prisma.rFQ.findUnique({
    where: { id: String(rfqId) },
  });

  if (!rfq) {
    return { notFound: true };
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { status: 'READY_FOR_MARKETPLACE' },
  });

  const chargeCategories = await prisma.chargeCategory.findMany();

  return {
    props: {
      rfq: JSON.parse(JSON.stringify(rfq)),
      warehouses: JSON.parse(JSON.stringify(warehouses)),
      chargeCategories: JSON.parse(JSON.stringify(chargeCategories)),
    },
  };
};

export default NewQuote;
